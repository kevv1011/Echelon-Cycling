"""Bounded OSM graph routing. Exposure heuristics are not measured crash risk."""
import asyncio
import heapq
import json
import math
import time
from collections import OrderedDict
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix='/api/routes')
OVERPASS_URLS = ('https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter')
MAX_NETWORK_BYTES = 12 * 1024 * 1024
MAX_ELEMENTS = 100000
MAX_GEOMETRY = 12000
MAX_EDGES = 180000
_slots = asyncio.Semaphore(1)
_cache = OrderedDict()

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Point(StrictModel):
    lat: float = Field(ge=-80, le=80)
    lon: float = Field(ge=-180, le=180)

class RouteRequest(StrictModel):
    waypoints: list[Point] = Field(min_length=2, max_length=8)
    avoidUnpaved: bool = True
    preferLit: bool = False

    @model_validator(mode='after')
    def bounded_area(self):
        if any(distance((a.lat, a.lon), (b.lat, b.lon)) < 15 for a, b in zip(self.waypoints, self.waypoints[1:])):
            raise ValueError('Consecutive stops must be at least 15 m apart')
        a = (min(p.lat for p in self.waypoints), min(p.lon for p in self.waypoints))
        b = (max(p.lat for p in self.waypoints), max(p.lon for p in self.waypoints))
        if distance(a, b) > 20000:
            raise ValueError('Keep the route area within a 20 km diagonal; plan longer rides in sections')
        return self

def distance(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat, dlon = lat2 - lat1, math.radians(b[1] - a[1])
    v = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(v)))

def bounds(points):
    padlat = .009
    padlon = .009 / max(.17, math.cos(math.radians(points[0].lat)))
    return (max(-85, min(p.lat for p in points) - padlat), max(-180, min(p.lon for p in points) - padlon), min(85, max(p.lat for p in points) + padlat), min(180, max(p.lon for p in points) + padlon))

def road_info(tags, avoid_unpaved):
    kind = tags.get('highway', '')
    # Access, construction and barrier uncertainty are handled conservatively.
    if kind not in {'cycleway', 'residential', 'living_street', 'service', 'unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link', 'path', 'track', 'footway', 'pedestrian'}:
        return None
    if tags.get('bicycle') in {'no', 'private', 'dismount', 'use_sidepath'} or tags.get('access') in {'no', 'private', 'customers', 'destination', 'permit'} or tags.get('vehicle') in {'no', 'private'}:
        return None
    if any(tags.get(k) for k in ('access:conditional', 'bicycle:conditional', 'vehicle:conditional', 'oneway:conditional', 'oneway:bicycle:conditional')) or tags.get('motorroad') == 'yes' or tags.get('construction') or tags.get('proposed') or tags.get('ford') == 'yes' or tags.get('route') == 'ferry':
        return None
    if kind in {'path', 'footway', 'pedestrian', 'track'} and tags.get('bicycle') not in {'yes', 'designated', 'permissive', 'official'}:
        return None
    if tags.get('service') in {'parking_aisle', 'driveway', 'emergency_access'}:
        return None
    surface = tags.get('surface', '')
    paved = surface in {'asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones'}
    unpaved = bool(surface) and not paved
    if avoid_unpaved and (unpaved or tags.get('smoothness') in {'bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'}):
        return None
    cycle_values = [tags.get(k, '') for k in ('cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both')]
    # Road-side lanes/tracks are not assumed usable in both travel directions.
    cycleway = kind == 'cycleway'
    lane = any(v in {'lane', 'track', 'opposite_lane', 'opposite_track', 'shared_lane'} for v in cycle_values)
    major = kind.startswith(('primary', 'secondary'))
    speed_raw = tags.get('maxspeed', '')
    try:
        speed = float(speed_raw.split()[0]) * (1.60934 if 'mph' in speed_raw else 1)
    except (ValueError, IndexError):
        speed = None
    fast = speed is not None and speed >= 60
    lit = tags.get('lit') == 'yes'
    unknown = not surface or speed is None or tags.get('lit') not in {'yes', 'no'}
    penalty = {'cycleway': 1.0, 'living_street': 1.2, 'residential': 1.7, 'service': 2.0, 'unclassified': 2.5, 'tertiary': 3.2, 'tertiary_link': 3.5, 'secondary': 6.5, 'secondary_link': 7, 'primary': 10, 'primary_link': 11}.get(kind, 2.5)
    if fast:
        penalty += 5
    if unpaved:
        penalty += 4
    if not surface:
        penalty += .8
    if speed is None:
        penalty += .5
    return {'kind': kind, 'cycleway': cycleway, 'lane': lane, 'major': major, 'fast': fast, 'lit': lit, 'unknown': unknown, 'unknownSurface': not surface, 'unknownSpeed': speed is None, 'unpaved': unpaved, 'penalty': penalty, 'name': tags.get('name', kind.replace('_', ' '))[:160]}

def build_graph(elements, request):
    if len(elements) > MAX_ELEMENTS:
        raise ValueError('Road network is too large. Choose a smaller area.')
    nodes, blocked = {}, set()
    for el in elements:
        if el.get('type') == 'node' and 'lat' in el and 'lon' in el:
            nodes[el['id']] = (el['lat'], el['lon'])
            tags = el.get('tags', {})
            if tags.get('barrier') and tags.get('barrier') not in {'bollard', 'cycle_barrier', 'entrance'} or tags.get('access') in {'private', 'no'} or tags.get('bicycle') in {'no', 'dismount'} or tags.get('highway') == 'ford':
                blocked.add(el['id'])
    graph, edge_count = {}, 0
    for el in elements:
        if el.get('type') != 'way':
            continue
        tags = el.get('tags', {})
        info = road_info(tags, request.avoidUnpaved)
        if info is None:
            continue
        oneway = tags.get('oneway:bicycle', tags.get('oneway', 'yes' if tags.get('junction') == 'roundabout' else 'no'))
        if 'oneway:bicycle' not in tags and tags.get('cycleway') in {'opposite', 'opposite_lane', 'opposite_track'}:
            oneway = 'no'
        for a, b in zip(el.get('nodes', []), el.get('nodes', [])[1:]):
            if a not in nodes or b not in nodes or a in blocked or b in blocked:
                continue
            length = distance(nodes[a], nodes[b])
            if length <= 0:
                continue
            if oneway != '-1':
                graph.setdefault(a, []).append((b, length, info))
                graph.setdefault(b, [])
                edge_count += 1
            if oneway not in {'yes', '1', 'true'}:
                graph.setdefault(b, []).append((a, length, info))
                graph.setdefault(a, [])
                edge_count += 1
            if edge_count > MAX_EDGES:
                raise ValueError('Road network is too dense. Choose a smaller area.')
    return nodes, graph

def shortest_path(graph, start, end, low_stress, prefer_lit):
    heap, costs, previous = [(0, start)], {start: 0}, {}
    while heap:
        cost, node = heapq.heappop(heap)
        if cost != costs[node]:
            continue
        if node == end:
            path = []
            while node != start:
                parent, length, info = previous[node]
                path.append((parent, node, length, info))
                node = parent
            return list(reversed(path))
        for nxt, length, info in graph.get(node, []):
            factor = info['penalty'] + (2 if prefer_lit and not info['lit'] else 0) if low_stress else 1
            new_cost = cost + length * factor
            if new_cost < costs.get(nxt, math.inf):
                costs[nxt] = new_cost
                previous[nxt] = (node, length, info)
                heapq.heappush(heap, (new_cost, nxt))
    raise ValueError('No connected cycling route found. Move stops closer to public roads or try another area.')

def summarize(edges, nodes, key, prefer_lit):
    total = sum(e[2] for e in edges)
    if total < 100:
        raise ValueError('Choose stops that create at least 100 m of road riding.')
    geometry = [nodes[edges[0][0]]] + [nodes[e[1]] for e in edges]
    if len(geometry) > MAX_GEOMETRY:
        raise ValueError('Route has too many points. Split the ride into sections.')
    stats = {name: round(sum(length for _, _, length, info in edges if info[flag]) / total * 100, 1) for name, flag in [('cyclewayPct', 'cycleway'), ('majorRoadPct', 'major'), ('highSpeedPct', 'fast'), ('litPct', 'lit'), ('unknownPct', 'unknown'), ('unknownSurfacePct', 'unknownSurface'), ('unknownSpeedPct', 'unknownSpeed'), ('unpavedPct', 'unpaved')]}
    exposure = sum(length * (info['penalty'] + (2 if prefer_lit and not info['lit'] else 0)) for _, _, length, info in edges)
    warnings = ['No live traffic, crash, crime, closures or turn-restriction data. Inspect every junction before riding.']
    if stats['unknownPct']:
        warnings.append(f"{stats['unknownPct']}% has missing surface, speed or lighting tags; missing does not mean safe.")
    if stats['majorRoadPct']:
        warnings.append(f"{stats['majorRoadPct']}% follows primary or secondary roads. Lane protection is not verified.")
    if prefer_lit and stats['litPct'] < 100:
        warnings.append(f"Only {stats['litPct']}% is tagged lit. Unlit and untagged roads may remain.")
    names = list(dict.fromkeys(info['name'] for _, _, _, info in edges))[:30]
    return {'id': key, 'name': 'Lower mapped exposure' if key == 'quieter' else 'Shortest eligible route', 'distanceKm': round(total / 1000, 3), 'geometry': geometry, 'stats': stats, 'exposureCost': round(exposure), 'warnings': warnings, 'roads': names}

def plan_from_elements(elements, request):
    nodes, graph = build_graph(elements, request)
    if not graph:
        raise ValueError('No eligible public cycling roads found here.')
    snapped, snap_distances = [], []
    for p in request.waypoints:
        n = min(graph, key=lambda n: distance((p.lat, p.lon), nodes[n]))
        gap = distance((p.lat, p.lon), nodes[n])
        if gap > 300:
            raise ValueError('A stop is more than 300 m from an eligible road node. Move it onto a nearby road.')
        snapped.append(n)
        snap_distances.append(round(gap))
    if any(a == b for a, b in zip(snapped, snapped[1:])):
        raise ValueError('Two stops snap to the same road point. Space them farther apart.')
    candidates = []
    for low_stress, key in [(False, 'shortest'), (True, 'quieter')]:
        edges = []
        for a, b in zip(snapped, snapped[1:]):
            edges.extend(shortest_path(graph, a, b, low_stress, request.preferLit))
        candidates.append(summarize(edges, nodes, key, request.preferLit))
    shortest, quieter = candidates
    same = shortest['geometry'] == quieter['geometry']
    reduction = round(max(0, 1 - quieter['exposureCost'] / max(1, shortest['exposureCost'])) * 100)
    if same:
        quieter['warnings'].insert(0, 'The two searches found the same route. No lower-exposure alternative was found in this area.')
    if any(gap > 30 for gap in snap_distances):
        for candidate in candidates:
            candidate['warnings'].append(f"Stops snapped up to {max(snap_distances)} m to mapped road nodes. Connecting paths are not routed; inspect those gaps.")
    return {'candidates': candidates, 'sameRoute': same, 'exposureReductionPct': reduction, 'snappedWaypoints': [nodes[n] for n in snapped], 'snapDistancesM': snap_distances, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'source': 'OpenStreetMap via Overpass', 'limits': '20 km planning area; road-tag heuristic, not a safety guarantee.'}

async def fetch_network(points):
    bbox = ','.join(f'{v:.6f}' for v in bounds(points))
    # Coordinates only; users cannot supply URLs or Overpass query fragments.
    cached = _cache.get(bbox)
    if cached and cached[0] > time.monotonic():
        _cache.move_to_end(bbox)
        return cached[1]
    query = f'[out:json][timeout:18];way["highway"]({bbox});(._;>;);out body;'
    async with httpx.AsyncClient(timeout=22, follow_redirects=False, headers={'User-Agent': 'EchelonCycling/1.1 (local route planner)', 'Accept': 'application/json'}) as client:
        for endpoint in OVERPASS_URLS:
            try:
                async with client.stream('POST', endpoint, data={'data': query}) as response:
                    if response.status_code in {429, 406}:
                        # Respect provider throttling; don't rotate servers to evade it.
                        raise HTTPException(503, 'Road-data service is busy. Wait at least 30 seconds before retrying.')
                    response.raise_for_status()
                    raw = bytearray()
                    async for chunk in response.aiter_bytes():
                        raw.extend(chunk)
                        if len(raw) > MAX_NETWORK_BYTES:
                            raise HTTPException(422, 'Road network is too large. Choose a smaller area.')
                data = json.loads(raw)
                if data.get('remark') or not isinstance(data.get('elements'), list):
                    raise ValueError('Incomplete road network')
                if len(data['elements']) > MAX_ELEMENTS:
                    raise HTTPException(422, 'Road network is too large. Choose a smaller area.')
                _cache[bbox] = (time.monotonic() + 600, data['elements'])
                while len(_cache) > 2:
                    _cache.popitem(last=False)
                return data['elements']
            except (httpx.HTTPError, ValueError, KeyError):
                continue
    raise HTTPException(502, 'Road data is unavailable. Try again later; no route has been invented.')

@router.post('/plan')
async def plan_route(request: RouteRequest):
    if _slots.locked():
        raise HTTPException(429, 'Routing is busy. Try again shortly.')
    async with _slots:
        try:
            async with asyncio.timeout(48):
                elements = await fetch_network(request.waypoints)
        except TimeoutError as error:
            raise HTTPException(504, 'Road data timed out. Try a smaller area later.') from error
        try:
            return await run_in_threadpool(plan_from_elements, elements, request)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
