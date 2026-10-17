import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRideTelemetry,normalizeFix,ingestFix,startRecording,pauseRecording,activeElapsed,gpsStatus,createLocationWatch,nearestRouteDistance,timerText,MAX_TRACK_POINTS} from '../src/utils/gps.js';
import {recordingGpx} from '../src/utils/customRoutes.js';
import {fallbackForecast,forecastQueryKey,forecastSyncDue} from '../src/utils/forecastState.js';
const start=Date.parse('2026-10-17T08:00:00Z');
const position=(seconds,lat=15,lon=120,accuracy=5,speed=4)=>({timestamp:start+seconds*1000,coords:{latitude:lat,longitude:lon,accuracy,speed}});
function sample(state,seconds,lat=15,lon=120,accuracy=5,speed=4){return ingestFix(state,position(seconds,lat,lon,accuracy,speed),start+seconds*1000,seconds*1000);}
test('GPS rejects old, non-finite, future and invalid coordinates',()=>{
 assert.equal(normalizeFix(position(0),start+16000),null);assert.equal(normalizeFix(position(6),start),null);
 assert.equal(normalizeFix(position(0,NaN),start),null);assert.equal(normalizeFix(position(0,91),start),null);assert.equal(normalizeFix(position(0,15,181),start),null);
 assert.equal(normalizeFix(position(0,15,120,-1),start),null);assert.equal(normalizeFix(position(0,15,120,5,Infinity),start).speed,null);
});
test('ride waits for a good fix, then real movement drives distance and moving time',()=>{
 let state=startRecording(initialRideTelemetry(),0,start);
 assert.equal(state.phase,'arming');assert.equal(activeElapsed(state,10000),0);
 state=sample(state,1);assert.equal(state.phase,'active');assert.equal(state.distanceM,0);
 state=sample(state,6,15.0001);assert.ok(state.distanceM>11&&state.distanceM<12);assert.equal(state.movingMs,5000);assert.equal(state.speed,14.4);assert.equal(activeElapsed(state,6000),5000);
});
test('stationary jitter does not invent ride distance',()=>{
 let state=sample(startRecording(initialRideTelemetry(),0,start),0);
 for(let n=1;n<=60;n++)state=sample(state,n,15+(n%2?0.000005:0),120,5,0);
 assert.equal(state.distanceM,0);assert.equal(state.movingMs,0);assert.equal(state.speed,0);
});
test('weak GPS, jumps and stale gaps do not bridge into recorded travel',()=>{
 let state=sample(startRecording(initialRideTelemetry(),0,start),0);
 state=sample(state,5,15.0001);const distance=state.distanceM;
 state=sample(state,6,15.01,120,200);assert.equal(state.distanceM,distance);assert.equal(gpsStatus(state,start+6000),'weak');
 state=sample(state,7,15.01);assert.equal(state.distanceM,distance);
 state=sample(state,8,16);assert.equal(state.distanceM,distance);assert.equal(state.fix,null);
 state=sample(state,9,15.01);assert.equal(state.distanceM,distance);
 state=sample(state,40,15.02);assert.equal(state.distanceM,distance);assert.ok(state.segments.length>=3);assert.equal(gpsStatus(state,start+60000),'stale');
});
test('paused ride excludes timer and distance, and resume starts a new track segment',()=>{
 let state=sample(startRecording(initialRideTelemetry(),0,start),0);
 state=sample(state,5,15.0001);state=pauseRecording(state,5000);const distance=state.distanceM;
 state=sample(state,15,15.001);assert.equal(state.distanceM,distance);assert.equal(activeElapsed(state,15000),5000);
 state=startRecording(state,15000,start+15000);state=sample(state,20,15.0011);
 assert.ok(state.distanceM>distance);assert.equal(activeElapsed(state,20000),10000);assert.ok(state.segments.length>=2);
});
test('monotonic timer and duration text work across hours without tick accumulation',()=>{
 const state={...initialRideTelemetry(),phase:'active',activeSince:5000,activeMs:2000};
 assert.equal(activeElapsed(state,15000),12000);assert.equal(timerText(3661000),'01:01:01');assert.equal(timerText(-10),'00:00:00');
});
test('watch lifecycle requests high accuracy and ignores callbacks after stop',()=>{
 let success,cleared=[],received=0,options;
 const stop=createLocationWatch({secure:true,geolocation:{watchPosition:(s,e,o)=>{success=s;options=o;return 0;},clearWatch:id=>cleared.push(id)},onFix:()=>received++,onError:()=>{}});
 assert.equal(options.enableHighAccuracy,true);assert.equal(options.maximumAge,0);success(position(0));assert.equal(received,1);stop();success(position(1));stop();assert.equal(received,1);assert.deepEqual(cleared,[0]);
});
test('denied or insecure GPS does not retry or leak a watch',()=>{
 let requested=0,errors=[],errorCallback,cleared=[];
 createLocationWatch({secure:false,geolocation:{watchPosition:()=>requested++},onFix:()=>{},onError:e=>errors.push(e)});assert.equal(requested,0);assert.equal(errors[0].code,0);
 createLocationWatch({secure:true,geolocation:{watchPosition:(s,e)=>{errorCallback=e;return 7;},clearWatch:id=>cleared.push(id)},onFix:()=>{},onError:e=>errors.push(e)});errorCallback({code:1});errorCallback({code:1});assert.deepEqual(cleared,[7]);assert.equal(errors.length,2);
});
test('recorded GPX preserves pause gaps instead of drawing connecting lines',()=>{
 const xml=recordingGpx('<ride>',[[[15,120],[15.001,120]],[[15.1,120],[15.101,120]]]);
 assert.equal((xml.match(/<trkseg>/g)||[]).length,2);assert.ok(xml.includes('&lt;ride&gt;'));assert.throws(()=>recordingGpx('empty',[[[15,120]]]));
});
test('route offset compares GPS with mapped geometry rather than a preset schematic',()=>{
 assert.equal(nearestRouteDistance({lat:15,lon:120},null),null);
 assert.ok(nearestRouteDistance({lat:15.005,lon:120},[[15,120],[15.01,120]])<.1);
 assert.ok(nearestRouteDistance({lat:15.005,lon:120.001},[[15,120],[15.01,120]])>100);
});
test('weather fallback preserves matching real data and never reuses another location',()=>{
 const ride={date:'2026-10-17',time:'05:30'},data=[{wind:12}],key=forecastQueryKey({lat:15,lon:120},ride,3);
 const cache={key,data,at:1234};const same=fallbackForecast(cache,key,ride,3);assert.equal(same.source,'cached');assert.equal(same.data,data);assert.equal(same.fetchedAt,1234);
 const changed=fallbackForecast(cache,forecastQueryKey({lat:16,lon:120},ride,3),ride,3);assert.equal(changed.source,'demo');assert.equal(changed.fetchedAt,null);assert.notEqual(changed.data,data);
 assert.equal(forecastSyncDue(0,600000,true),true);assert.equal(forecastSyncDue(0,599999,true),false);assert.equal(forecastSyncDue(0,600000,false),false);
});
test('track storage is bounded while aggregate distance can continue growing',()=>{
 let state=sample(startRecording(initialRideTelemetry(),0,start),0);
 state={...state,segments:[Array.from({length:MAX_TRACK_POINTS},()=>[15,120])]};
 state=sample(state,5,15.0001);assert.equal(state.segments.reduce((n,s)=>n+s.length,0),MAX_TRACK_POINTS);assert.equal(state.trackTruncated,true);assert.ok(state.distanceM>0);
});
