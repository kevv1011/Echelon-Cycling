import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, windRelation } from '../src/utils/cyclingPhysics.js';
import { defaultProfile } from '../src/data/routes.js';
import { parseCommand, directorRequest, directorAnswer } from '../src/utils/director.js';
import { routes } from '../src/data/routes.js';
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
test('greetings, thanks and unsupported chat do not become ride briefings',()=>{
 for(const message of ['hello','Hey there!','Hello, how are you?','good morning','thanks','Tell me a joke']){
  const request=directorRequest(message,ride,defaultProfile);
  assert.equal(request.type,'reply');assert.ok(!request.text.includes('SETUP'));assert.equal(request.ride,undefined);
 }
 assert.match(directorRequest('hello',ride,defaultProfile).text,/Hey!/);
 assert.match(directorRequest('Tell me a joke',ride,defaultProfile).text,/didn’t recognize/);
});
test('questions preview their own context while commands explicitly apply changes',()=>{
 const question=directorRequest('How many gels for the 112km Monasterio ride at Tempo?',ride,defaultProfile);
 assert.equal(question.apply,false);assert.equal(question.topic,'fuel');assert.equal(question.ride.routeId,'monasterio');assert.equal(question.ride.distance,112);assert.equal(ride.routeId,'clark');
 const command=directorRequest('Set my ride to 60km at Tempo',ride,defaultProfile);
 assert.equal(command.apply,true);assert.equal(command.ride.distance,60);
 const advice=directorRequest('Should I switch to 30mm tubeless?',ride,defaultProfile);assert.equal(advice.apply,false);assert.equal(advice.topic,'pressure');
});
test('weather questions and unrelated substrings cannot silently change road conditions or effort',()=>{
 const auto={...ride,condition:'auto'};
 assert.equal(directorRequest('Will it rain tomorrow?',auto,defaultProfile).ride.condition,'auto');
 const unrelated=parseCommand('I am training and learning about databases',auto,defaultProfile);
 assert.equal(unrelated.ride.effort,auto.effort);assert.equal(unrelated.ride.condition,'auto');
});
test('focused fuel and wind answers use the requested model and forecast without a full briefing',()=>{
 const route=routes.find(r=>r.id==='clark'),weather=demoWeather(ride,3),plan=calculatePlan(defaultProfile,ride,weather);
 const fuel=directorAnswer('fuel',route,ride,defaultProfile,plan,weather,'live');
 assert.ok(fuel.includes(`${plan.gels} gels`));assert.ok(fuel.includes(`${plan.totalCarbs} g`));assert.ok(!fuel.includes('SETUP'));
 const wind=directorAnswer('wind',route,ride,defaultProfile,plan,weather,'demo');
 assert.ok(wind.includes('Simulated weather'));assert.ok(wind.includes(`${weather[0].wind} km/h`));assert.ok(!wind.includes('FUEL'));
});
test('FTP and bike weight update their actual fields rather than rider weight',()=>{
 const ftp=parseCommand('Set my FTP to 280 watts',ride,defaultProfile);assert.equal(ftp.profile.ftp,280);
 const bike=parseCommand('My bike weighs 8kg',ride,defaultProfile);assert.equal(bike.profile.bikeWeight,8);assert.equal(bike.profile.riderWeight,defaultProfile.riderWeight);
});
