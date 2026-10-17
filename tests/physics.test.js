import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, windRelation } from '../src/utils/cyclingPhysics.js';
import { defaultProfile } from '../src/data/routes.js';
import { parseCommand } from '../src/utils/director.js';
import { demoWeather } from '../src/services/weatherApi.js';
const ride = { routeId:'clark',distance:42,elevation:380,effort:'z2',condition:'dry',date:'2026-10-18',time:'05:30' };
test('rear load, larger tires, wet roads and tubes change pressure in the expected directions',()=>{
 const p=calculatePlan(defaultProfile,ride);
 assert.ok(p.rear>p.front);
 assert.ok(calculatePlan({...defaultProfile,tireWidth:32},ride).rear<p.rear);
 assert.ok(calculatePlan(defaultProfile,{...ride,condition:'wet'}).rear<p.rear);
 assert.ok(calculatePlan({...defaultProfile,tubeless:false},ride).rear>p.rear);
 assert.ok(calculatePlan({...defaultProfile,riderWeight:85},ride).rear>p.rear);
});
test('climbing and wind cost speed; higher FTP improves speed',()=>{
 const p=calculatePlan(defaultProfile,ride);
 assert.ok(calculatePlan(defaultProfile,{...ride,elevation:1000}).speed<p.speed);
 assert.ok(calculatePlan({...defaultProfile,ftp:300},ride).speed>p.speed);
 const h=[{wind:25,feels:30,rain:0}];assert.ok(calculatePlan(defaultProfile,ride,h).speed<p.speed);
});
test('fuel totals, moving time, hydration and heat response remain consistent',()=>{
 const p=calculatePlan(defaultProfile,ride,[{wind:0,feels:35,rain:0}]);
 assert.equal(p.hours,ride.distance/p.speed);assert.equal(p.gels,Math.ceil(p.carbs*p.hours/25));assert.equal(p.bottles,Math.ceil(p.hydration/.75));assert.equal(p.sodiumRate,800);
 assert.ok(calculatePlan(defaultProfile,{...ride,effort:'race'}).carbs>p.carbs);
});
test('meteorological wind direction is FROM, correctly classified against travel bearing',()=>{
 assert.equal(windRelation(0,0,15).type,'Headwind');assert.equal(windRelation(180,0,15).type,'Tailwind');assert.equal(windRelation(90,0,15).type,'Crosswind');
});
test('director applies route, distance, rider, setup, effort and AM start atomically',()=>{
 const p=parseCommand('Plan a 65km Clark ride tomorrow at 5:30 AM, 72kg rider on 30mm tubeless, Tempo in the rain',ride,defaultProfile);
 assert.equal(p.ride.distance,65);assert.equal(p.ride.time,'05:30');assert.equal(p.ride.condition,'wet');assert.equal(p.ride.effort,'tempo');assert.equal(p.profile.riderWeight,72);assert.equal(p.profile.tireWidth,30);
 const evening=parseCommand('Subic at 5 pm with inner tubes',ride,defaultProfile);assert.equal(evening.ride.time,'17:00');assert.equal(evening.profile.tubeless,false);assert.equal(evening.ride.elevation,890);
});
test('demo weather crosses midnight without wrapping back to the ride date',()=>{
 const h=demoWeather({...ride,time:'23:30'},3);assert.equal(h[0].time,'2026-10-18T23:00');assert.equal(h[1].time,'2026-10-19T00:00');
});
