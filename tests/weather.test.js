import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWeather } from '../src/services/weatherApi.js';
const route = {lat:15.185,lon:120.535};
const ride = {date:'2026-10-18',time:'23:30'};
test('forecast requests span midnight in Manila and select the partial first hour',async()=>{
 const original=globalThis.fetch;
 let requested;
 globalThis.fetch=async url=>{requested=new URL(url);return {ok:true,json:async()=>({hourly:{time:['2026-10-18T22:00','2026-10-18T23:00','2026-10-19T00:00','2026-10-19T01:00'],temperature_2m:[26,27,28,29],apparent_temperature:[28,29,30,31],precipitation_probability:[0,10,20,30],wind_speed_10m:[3,4,5,6],wind_direction_10m:[0,45,90,135]}})};};
 try { const result=await fetchWeather(route,ride,3);assert.equal(requested.searchParams.get('timezone'),'Asia/Manila');assert.equal(requested.searchParams.get('end_date'),'2026-10-19');assert.equal(result[0].time,'2026-10-18T23:00');assert.equal(result[2].wind,6); }
 finally {globalThis.fetch=original;}
});
test('incomplete forecast data cannot be marked live',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({hourly:{time:['2026-10-18T23:00'],temperature_2m:[null],apparent_temperature:[29],precipitation_probability:[10],wind_speed_10m:[4],wind_direction_10m:[45]}})});
 try {await assert.rejects(()=>fetchWeather(route,ride,1),/Incomplete/);await assert.rejects(()=>fetchWeather(route,ride,3),/window unavailable/);}finally{globalThis.fetch=original;}
});
