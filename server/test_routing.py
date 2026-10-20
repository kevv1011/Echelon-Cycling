import unittest
from urllib.parse import parse_qs
from unittest.mock import patch
import httpx
from fastapi import HTTPException
from pydantic import ValidationError
from server.routing import RouteRequest, build_graph, plan_from_elements, road_info, shortest_path
from server import routing

def network():
    return [
        {'type':'node','id':1,'lat':15.18,'lon':120.53},
        {'type':'node','id':2,'lat':15.18,'lon':120.534},
        {'type':'node','id':3,'lat':15.1815,'lon':120.532},
        {'type':'way','id':10,'nodes':[1,2],'tags':{'highway':'primary','name':'Busy Road','surface':'asphalt','maxspeed':'70','lit':'no'}},
        {'type':'way','id':11,'nodes':[1,3,2],'tags':{'highway':'residential','name':'Quiet Lane','surface':'asphalt','maxspeed':'30','lit':'yes'}},
    ]

def request(**kwargs):
    return RouteRequest(waypoints=[{'lat':15.18,'lon':120.53},{'lat':15.18,'lon':120.534}],**kwargs)

class RoutingTests(unittest.TestCase):
    def test_suggests_real_lower_exposure_detour(self):
        result=plan_from_elements(network(),request())
        short,quiet=result['candidates']
        self.assertEqual(short['roads'],['Busy Road'])
        self.assertEqual(quiet['roads'],['Quiet Lane'])
        self.assertGreater(quiet['distanceKm'],short['distanceKm'])
        self.assertEqual(quiet['stats']['majorRoadPct'],0)
        self.assertEqual(short['stats']['highSpeedPct'],100)
        self.assertGreater(result['exposureReductionPct'],0)
        self.assertFalse(result['sameRoute'])

    def test_excludes_restricted_and_unsuitable_roads(self):
        for tags in [{'highway':'motorway'},{'highway':'trunk'},{'highway':'steps'},{'highway':'residential','access':'private'},{'highway':'residential','bicycle':'no'},{'highway':'residential','bicycle':'dismount'},{'highway':'residential','access:conditional':'yes @ (08:00-17:00)'},{'highway':'footway'},{'highway':'residential','ford':'yes'}]:
            self.assertIsNone(road_info(tags,True),tags)
        self.assertIsNone(road_info({'highway':'residential','surface':'gravel'},True))
        self.assertIsNotNone(road_info({'highway':'residential','surface':'gravel'},False))

    def test_honors_one_way_and_explicit_bicycle_exception(self):
        elements=network()[:2]+[{'type':'way','nodes':[1,2],'tags':{'highway':'residential','oneway':'yes'}}]
        nodes,graph=build_graph(elements,request())
        self.assertEqual(len(shortest_path(graph,1,2,False,False)),1)
        with self.assertRaisesRegex(ValueError,'No connected'):
            shortest_path(graph,2,1,False,False)
        elements[-1]['tags']['oneway:bicycle']='no'
        nodes,graph=build_graph(elements,request())
        self.assertEqual(len(shortest_path(graph,2,1,False,False)),1)

    def test_unknown_tags_are_not_treated_as_known_safe(self):
        elements=network()[:2]+[{'type':'way','nodes':[1,2],'tags':{'highway':'residential'}}]
        result=plan_from_elements(elements,request())
        quiet=result['candidates'][1]
        self.assertEqual(quiet['stats']['unknownPct'],100)
        self.assertTrue(result['sameRoute'])
        self.assertTrue(any('No lower-exposure' in w for w in quiet['warnings']))
        self.assertTrue(any('missing' in w for w in quiet['warnings']))

    def test_no_fabricated_path_when_disconnected_or_far_from_roads(self):
        with self.assertRaises(ValueError):
            plan_from_elements(network()[:3],request())
        far=RouteRequest(waypoints=[{'lat':15.18,'lon':120.53},{'lat':15.2,'lon':120.56}])
        with self.assertRaisesRegex(ValueError,'300 m'):
            plan_from_elements(network(),far)

    def test_limits_area_waypoint_count_and_unexpected_fields(self):
        for payload in [
            {'waypoints':[{'lat':15,'lon':120},{'lat':16,'lon':121}]},
            {'waypoints':[{'lat':15,'lon':120}]*9},
            {'waypoints':[{'lat':15,'lon':120},{'lat':15.00001,'lon':120}]},
            {'waypoints':[{'lat':15,'lon':120},{'lat':15.01,'lon':120}],'url':'http://localhost'},
            {'waypoints':[{'lat':float('nan'),'lon':120},{'lat':15.01,'lon':120}]},
        ]:
            with self.assertRaises(ValidationError):
                RouteRequest.model_validate(payload)

    def test_mapped_gate_with_no_bicycle_access_blocks_routing(self):
        elements=network()
        elements[2]['tags']={'barrier':'gate','bicycle':'no'}
        elements[3]['tags']['bicycle']='no'
        with self.assertRaises(ValueError):
            plan_from_elements(elements,request())

    def test_lighting_preference_changes_exposure_cost(self):
        off=plan_from_elements(network(),request(preferLit=False))
        on=plan_from_elements(network(),request(preferLit=True))
        self.assertGreater(on['candidates'][0]['exposureCost'],off['candidates'][0]['exposureCost'])
        self.assertEqual(on['candidates'][1]['stats']['litPct'],100)

class UpstreamTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        routing._cache.clear()

    async def test_provider_failover_and_cache(self):
        calls=[]
        def handle(req):
            calls.append(req)
            return httpx.Response(502) if len(calls)==1 else httpx.Response(200,json={'elements':network()})
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle))
        with patch('server.routing.httpx.AsyncClient',return_value=client):
            result=await routing.fetch_network(request().waypoints)
            cached=await routing.fetch_network(request().waypoints)
        self.assertEqual(len(calls),2)
        self.assertEqual(result,cached)
        query=parse_qs(calls[0].content.decode())['data'][0]
        self.assertIn('way["highway"~"^(',query)
        self.assertIn('cycleway',query)
        self.assertIn('residential',query)
        self.assertNotIn('motorway',query)

    async def test_throttling_is_respected_without_provider_rotation(self):
        calls=[]
        def handle(req):
            calls.append(req.url)
            return httpx.Response(429)
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle))
        with patch('server.routing.httpx.AsyncClient',return_value=client):
            with self.assertRaises(HTTPException) as raised:
                await routing.fetch_network(request().waypoints)
        self.assertEqual(raised.exception.status_code,503)
        self.assertEqual(len(calls),1)

    async def test_external_response_size_is_bounded(self):
        client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req:httpx.Response(200,content=b'x'*100)))
        with patch('server.routing.httpx.AsyncClient',return_value=client),patch('server.routing.MAX_NETWORK_BYTES',32):
            with self.assertRaises(HTTPException) as raised:
                await routing.fetch_network(request().waypoints)
        self.assertEqual(raised.exception.status_code,422)

if __name__=='__main__':
    unittest.main()
