"""Run: python -m unittest server.test_api"""
import os
import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from server import main
from server.security import Security, MAX_BODY
from server.security import IDLE_TIMEOUT, ABSOLUTE_TIMEOUT
from server.test_routing import network

class APITest(unittest.TestCase):
    def setUp(self):
        self.previous_password=main.security.password
        main.security.password=''
        main.security.buckets.clear()
        main.security.sessions.clear()
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.patcher = patch.object(main, 'engine', self.engine)
        self.patcher.start()
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.patcher.stop()
        main.security.password=self.previous_password

    def test_origin_and_host_protection(self):
        self.assertEqual(self.client.get('/api/profile',headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.put('/api/profile',json={},headers={'Origin':'null'}).status_code,403)
        self.assertEqual(self.client.get('/api/profile',headers={'Host':'evil.example'}).status_code,400)
        self.assertEqual(self.client.get('/api/profile',headers={'Origin':'http://127.0.0.1:5173'}).status_code,200)

    def test_local_mode_cannot_be_used_from_remote_client(self):
        with TestClient(main.app,client=('203.0.113.7',5000)) as remote:
            self.assertEqual(remote.get('/api/profile',headers={'X-Forwarded-For':'127.0.0.1'}).status_code,403)

    def test_request_size_limit_applies_with_and_without_content_length(self):
        self.assertEqual(self.client.post('/api/plans',content=b'{}',headers={'Content-Length':str(MAX_BODY+1)}).status_code,413)
        self.assertEqual(self.client.post('/api/plans',content=iter([b'x'*(MAX_BODY+1)])).status_code,413)

    def test_private_session_login_logout_and_cookie_flags(self):
        main.security.password='test-only-strong-password'
        self.assertEqual(self.client.get('/api/profile').status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'password':'wrong'}).status_code,401)
        response=self.client.post('/api/auth/login',json={'password':'test-only-strong-password'})
        self.assertEqual(response.status_code,200)
        cookie=response.headers['set-cookie'].lower()
        self.assertIn('httponly',cookie)
        self.assertIn('samesite=strict',cookie)
        self.assertNotIn('session',response.text)
        self.assertEqual(self.client.get('/api/profile').status_code,200)
        self.assertEqual(self.client.post('/api/auth/logout').status_code,204)
        self.assertEqual(self.client.get('/api/profile').status_code,401)

    def test_brute_force_is_rate_limited(self):
        main.security.password='test-only-strong-password'
        for _ in range(5):
            self.assertEqual(self.client.post('/api/auth/login',json={'password':'wrong'}).status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'password':'wrong'}).status_code,429)

    def test_status_polling_does_not_extend_idle_timeout(self):
        security=Security();security.password='test-only-strong-password'
        with patch('server.security.time.monotonic',return_value=100):
            token=security.login('test-only-strong-password')
        with patch('server.security.time.monotonic',return_value=100+IDLE_TIMEOUT-1):
            self.assertTrue(security.permitted('testclient',token))
        with patch('server.security.time.monotonic',return_value=100+IDLE_TIMEOUT+1):
            self.assertFalse(security.permitted('testclient',token))

    def test_explicit_activity_extends_idle_but_not_absolute_lifetime(self):
        security=Security();security.password='test-only-strong-password'
        with patch('server.security.time.monotonic',return_value=100):
            token=security.login('test-only-strong-password')
        for seconds in range(600,ABSOLUTE_TIMEOUT,600):
            with patch('server.security.time.monotonic',return_value=100+seconds):
                self.assertTrue(security.touch('testclient',token))
        with patch('server.security.time.monotonic',return_value=100+ABSOLUTE_TIMEOUT+1):
            self.assertFalse(security.touch('testclient',token))

    def test_reauthentication_revokes_previous_browser_token(self):
        main.security.password='test-only-strong-password'
        payload={'password':'test-only-strong-password'}
        self.client.post('/api/auth/login',json=payload)
        previous=self.client.cookies.get('echelon_session')
        self.client.post('/api/auth/login',json=payload)
        self.assertNotEqual(previous,self.client.cookies.get('echelon_session'))
        self.assertFalse(main.security.permitted('testclient',previous))
        self.assertEqual(self.client.post('/api/auth/activity').status_code,200)

    def test_secure_cookie_cannot_be_sent_over_plain_http(self):
        main.security.password='test-only-strong-password'
        old_secure=main.security.secure_cookie
        try:
            main.security.secure_cookie=True
            response=self.client.post('/api/auth/login',json={'password':'test-only-strong-password'})
            self.assertIn('secure',response.headers['set-cookie'].lower())
            self.assertEqual(self.client.get('/api/profile').status_code,401)
        finally:
            main.security.secure_cookie=old_secure

    def test_public_deployment_fails_closed(self):
        with patch.dict(os.environ,{'ALLOWED_HOSTS':'api.example.com','ECHELON_ACCESS_PASSWORD':'','ECHELON_COOKIE_SECURE':'false'}):
            with self.assertRaises(RuntimeError):Security()
        with patch.dict(os.environ,{'ALLOWED_HOSTS':'api.example.com','ECHELON_ACCESS_PASSWORD':'test-only-strong-password','ECHELON_COOKIE_SECURE':'true','CORS_ORIGINS':'https://app.example.com'}):
            self.assertTrue(Security().secure_cookie)

    def test_security_headers_and_validation(self):
        response=self.client.get('/api/profile')
        self.assertEqual(response.headers['x-content-type-options'],'nosniff')
        self.assertEqual(response.headers['cache-control'],'no-store')
        profile=response.json();profile['unexpected']='untrusted'
        self.assertEqual(self.client.put('/api/profile',json=profile).status_code,422)

    def test_routes_api_uses_road_graph(self):
        payload={'waypoints':[{'lat':15.18,'lon':120.53},{'lat':15.18,'lon':120.534}],'avoidUnpaved':True,'preferLit':True}
        with patch('server.routing.fetch_network',new=AsyncMock(return_value=network())) as upstream:
            response=self.client.post('/api/routes/plan',json=payload)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(len(response.json()['candidates']),2)
        self.assertEqual(response.json()['candidates'][1]['stats']['majorRoadPct'],0)
        upstream.assert_awaited_once()

    def test_custom_route_persistence_and_invalid_geometry(self):
        from server.routing import plan_from_elements, RouteRequest
        points=[{'lat':15.18,'lon':120.53},{'lat':15.18,'lon':120.534}]
        result=plan_from_elements(network(),RouteRequest(waypoints=points))
        candidate=result['candidates'][1]
        custom={'name':'My test route','geometry':candidate['geometry'],'waypoints':points,'stats':candidate['stats'],'warnings':candidate['warnings'],'fetchedAt':result['fetchedAt'],'kind':'quieter','lat':15.18,'lon':120.53,'bearing':90}
        ride={'routeId':'custom','distance':candidate['distanceKm'],'elevation':0,'date':'2026-10-18','time':'05:30','effort':'z2','condition':'auto','customRoute':custom}
        payload={'id':'custom-plan','name':'My test route','date':'2026-10-18','createdAt':'2026-10-17T12:00:00Z','ride':ride,'profile':self.client.get('/api/profile').json(),'weather':[],'source':'demo','plan':{'speed':26.5},'briefing':'Custom route briefing'}
        self.assertEqual(self.client.post('/api/plans',json=payload).status_code,201)
        saved=self.client.get('/api/plans').json()[0]
        self.assertEqual(saved['ride']['customRoute']['geometry'],[list(p) for p in candidate['geometry']])
        payload['id']='invalid-custom';custom['geometry']=[[999,120],[15,120]]
        self.assertEqual(self.client.post('/api/plans',json=payload).status_code,422)

    def test_profile_roundtrip_and_validation(self):
        profile = self.client.get('/api/profile').json()
        profile['riderWeight'] = 72
        self.assertEqual(self.client.put('/api/profile', json=profile).status_code, 200)
        self.assertEqual(self.client.get('/api/profile').json()['riderWeight'], 72)
        profile['riderWeight'] = -1
        self.assertEqual(self.client.put('/api/profile', json=profile).status_code, 422)

    def test_cue_sheet_crud(self):
        payload = {'id': 'test-plan', 'name': 'Clark', 'date': '2026-10-18', 'createdAt': '2026-10-17T12:00:00Z', 'ride': {'routeId': 'clark', 'distance': 42, 'elevation': 380, 'date': '2026-10-18', 'time': '05:30', 'effort': 'z2', 'condition': 'auto'}, 'profile': self.client.get('/api/profile').json(), 'weather': [], 'source': 'demo', 'plan': {'speed': 26.5, 'wet': False}, 'briefing': 'Test briefing'}
        self.assertEqual(self.client.post('/api/plans', json=payload).status_code, 201)
        self.assertEqual(self.client.post('/api/plans', json=payload).status_code, 409)
        plans = self.client.get('/api/plans').json()
        self.assertEqual(plans[0]['briefing'], 'Test briefing')
        self.assertEqual(plans[0]['source'], 'demo')
        self.assertEqual(self.client.delete('/api/plans/test-plan').status_code, 204)
        self.assertEqual(self.client.get('/api/plans').json(), [])
        self.assertEqual(self.client.delete('/api/plans/test-plan').status_code, 404)
        payload.update(id='cached-plan',source='cached',forecastFetchedAt='2026-10-17T12:00:00Z')
        self.assertEqual(self.client.post('/api/plans',json=payload).status_code,201)
        saved=self.client.get('/api/plans').json()[0]
        self.assertEqual(saved['source'],'cached')
        self.assertTrue(saved['forecastFetchedAt'].startswith('2026-10-17T12:00:00'))

    def test_invalid_weather_window(self):
        self.assertEqual(self.client.get('/api/weather?latitude=15&longitude=120&start_date=2020-01-01&end_date=2020-01-02').status_code, 422)

if __name__ == '__main__':
    unittest.main()
