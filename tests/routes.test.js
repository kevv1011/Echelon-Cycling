import test from 'node:test';
import assert from 'node:assert/strict';
import {validGeometry,routeGpx,customRouteMetadata,routeBearing} from '../src/utils/customRoutes.js';
import {parseCommand} from '../src/utils/director.js';
import {defaultProfile} from '../src/data/routes.js';
import {browserHeaders} from '../security-headers.js';
import {validatedApiBase} from '../src/utils/apiConfig.js';
const geometry=[[15,120],[15.01,120]];
test('custom routes use mapped coordinates and initial heading for weather telemetry',()=>{
 const route=customRouteMetadata({id:'quieter',geometry,stats:{},warnings:[]},[],'My route','2026-10-17T00:00:00Z');
 assert.equal(route.lat,15.01);assert.equal(route.lon,120);assert.equal(route.bearing,0);assert.equal(route.name,'My route');
 assert.ok(Math.abs(routeBearing([[15,120],[15,120.01]])-90)<.01);
});
test('GPX escapes route names and rejects non-finite or out-of-range coordinates',()=>{
 const xml=routeGpx('<script>&"',geometry);
 assert.ok(xml.includes('&lt;script&gt;&amp;&quot;'));assert.ok(!xml.includes('<script>'));
 for(const invalid of [[[NaN,120],[15,120]],[[100,120],[15,120]],[[15,190],[15,120]],[]]){assert.equal(validGeometry(invalid),false);assert.throws(()=>routeGpx('bad',invalid));}
});
test('chat does not overwrite mapped distance and clears geometry when selecting a preset',()=>{
 const ride={routeId:'custom',distance:12,elevation:50,customRoute:{geometry}};
 const same=parseCommand('Make this 60km at Tempo',ride,defaultProfile);assert.equal(same.ride.distance,12);assert.equal(same.ride.effort,'tempo');
 const preset=parseCommand('Clark at 5am',ride,defaultProfile);assert.equal(preset.ride.routeId,'clark');assert.equal(preset.ride.customRoute,null);assert.equal(preset.ride.distance,42);
});
test('production CSP restricts scripts, frames, object embeds and connections',()=>{
 const headers=browserHeaders();const policy=headers['Content-Security-Policy'];
 assert.ok(policy.includes("script-src 'self';"));assert.ok(policy.includes("object-src 'none'"));assert.ok(policy.includes("frame-ancestors 'none'"));assert.ok(!policy.includes('ws://'));assert.equal(headers['X-Content-Type-Options'],'nosniff');
 assert.ok(headers['Permissions-Policy'].includes('geolocation=(self)'));assert.ok(headers['Permissions-Policy'].includes('camera=()'));
});
test('API origins reject plaintext remote transport and credential-bearing URLs',()=>{
 assert.equal(validatedApiBase(''),'');assert.equal(validatedApiBase('http://127.0.0.1:8000/'),'http://127.0.0.1:8000');assert.equal(validatedApiBase('https://api.example.com'),'https://api.example.com');
 for(const url of ['http://remote.example.com','https://secret:password@api.example.com','https://api.example.com/?key=secret','https://api.example.com/path','javascript:alert(1)'])assert.throws(()=>validatedApiBase(url));
});
