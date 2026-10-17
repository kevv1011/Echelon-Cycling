// Integration test DOM only: no real location access or external tile requests.
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import {createServer} from 'vite';

const hostedDemo=process.argv.includes('--hosted-demo');
if(hostedDemo){process.env.VITE_HOSTED_DEMO='true';process.env.VITE_USE_MOCK_API='true';process.env.VITE_API_URL='';}
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:5173',pretendToBeVisual:true});
const replaced=new Map();
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,requestAnimationFrame:callback=>setTimeout(()=>callback(performance.now()),16),cancelAnimationFrame:id=>clearTimeout(id),IS_REACT_ACT_ENVIRONMENT:true})){
 replaced.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
}
Object.defineProperty(window,'isSecureContext',{value:true});
let positionCallback,watchCalls=0,cleared=0,backendRequests=0,forecastRequests=0,releaseForecast;
const forecastGate=new Promise(resolve=>releaseForecast=resolve);
if(hostedDemo)localStorage.setItem('echelon:private-mode','true');
Object.defineProperty(navigator,'geolocation',{value:{watchPosition:callback=>{positionCallback=callback;watchCalls++;return 42;},clearWatch:id=>{assert.equal(id,42);cleared++;}}});
const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=new URL(String(input),'http://localhost:5173');
 if(url.pathname.startsWith('/api/')){backendRequests++;if(hostedDemo)throw new Error('Hosted demo must not contact a private API');}
 let data;
 if(url.pathname==='/api/auth/status')data={passwordRequired:false,authenticated:true,sessionRemainingSeconds:null};
 else if(url.hostname==='api.open-meteo.com'){
  forecastRequests++;await forecastGate;
  const first=new Date(`${url.searchParams.get('start_date')}T00:00:00Z`),time=Array.from({length:72},(_,i)=>new Date(+first+i*3600000).toISOString().slice(0,16));
  data={hourly:{time,temperature_2m:time.map(()=>28),apparent_temperature:time.map(()=>31),precipitation_probability:time.map(()=>10),wind_speed_10m:time.map(()=>12),wind_direction_10m:time.map(()=>45)}};
 }else throw new Error(`Unexpected integration request: ${url.pathname}`);
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
const root=createRoot(document.getElementById('root'));
const flush=()=>new Promise(resolve=>setTimeout(resolve,40));
try{
 const {default:App}=await server.ssrLoadModule('/src/App.jsx');
 await act(async()=>{root.render(React.createElement(React.StrictMode,null,React.createElement(App)));await flush();});
 assert.equal(watchCalls,0,'Loading the app must not request location');
 if(hostedDemo){assert.ok(document.querySelector('.topbar').textContent.includes('DEMO MODE'),'Hosted demo identifies itself');assert.ok(!document.querySelector('.access-button'),'Hosted demo has no private sign-in control');}
 const navigate=async section=>{const button=[...document.querySelectorAll('.mobile-nav button')].find(b=>b.textContent===section);assert.ok(button);await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));assert.equal(button.getAttribute('aria-pressed'),'true');};
 await navigate('Chat');assert.equal(document.querySelector('.app-shell').dataset.mobileView,'chat');
 const message=async text=>{const input=document.getElementById('director-input');await act(async()=>Simulate.change(input,{target:{value:text}}));const button=document.querySelector('.send-button');assert.equal(button.disabled,false);await act(async()=>{button.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));await flush();});};
 const lastReply=()=>[...document.querySelectorAll('.message.assistant p')].at(-1).textContent;
 const forecastBefore=forecastRequests;
 await message('hello');assert.match(lastReply(),/Hey!/);assert.ok(!lastReply().includes('SETUP'));assert.equal(forecastRequests,forecastBefore,'Greeting does not start another forecast request');
 releaseForecast();await act(async()=>await flush());
 await message('How many gels for the 112km Monasterio ride at Tempo?');assert.match(lastReply(),/Monasterio/);assert.match(lastReply(),/gels/);assert.equal(document.getElementById('route').value,'clark','Question previews leave selected ride unchanged');
 await message('Set my ride to 60km at Tempo');assert.ok(document.querySelector('.change-list').textContent.includes('60 km'));assert.equal(document.querySelector('[aria-label="Pace effort"]').value,'tempo','Explicit command updates dashboard');
 await message('Tell me a joke');assert.match(lastReply(),/didn’t recognize/);
 const themeButton=document.querySelector('.theme-toggle');assert.equal(document.documentElement.dataset.theme,'dark');await act(async()=>themeButton.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));assert.equal(document.documentElement.dataset.theme,'light');assert.equal(localStorage.getItem('echelon:theme'),'light');assert.equal(themeButton.getAttribute('aria-label'),'Switch to dark mode');
 await navigate('Ride');assert.equal(document.querySelector('.app-shell').dataset.mobileView,'ride');
 const start=[...document.querySelectorAll('button')].find(b=>b.textContent==='Start ride');
 assert.ok(start,'Start ride control exists');
 await act(async()=>{start.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));await flush();});
 assert.equal(watchCalls,1,'Starting requests one location watch');
 const now=Date.now(),fix=(timestamp,latitude)=>({timestamp,coords:{latitude,longitude:120,accuracy:5,speed:4}});
 await act(async()=>{positionCallback(fix(now-4000,15));await flush();});
 await act(async()=>{positionCallback(fix(now-1000,15.0001));await flush();});
 assert.equal(document.querySelector('.gps-badge').textContent,'GPS LIVE');
 const metrics=document.querySelector('.ride-live-metrics').textContent;
 assert.ok(metrics.includes('14.4'),'GPS speed updates from device reading');
 assert.ok(metrics.includes('0.01'),'Measured distance updates from consecutive fixes');
 assert.ok(document.querySelector('.leaflet-container'),'Live street map initializes');
 assert.ok(document.querySelectorAll('.leaflet-overlay-pane path').length>=2,'GPS marker/accuracy layers render');
 const before=document.querySelectorAll('.leaflet-overlay-pane path').length;
 await act(async()=>{positionCallback(fix(Date.now(),15.00011));await flush();});
 assert.ok(document.querySelectorAll('.leaflet-overlay-pane path').length<=before+1,'Location updates reuse layers');
 await navigate('Chat');assert.equal(cleared,0,'Opening chat does not stop an active ride');await navigate('Ride');assert.equal(watchCalls,1,'Switching sections does not create a second GPS watch');
 await act(async()=>{window.dispatchEvent(new CustomEvent('echelon:api-disconnected',{detail:{clearOffline:true}}));await flush();});
 assert.equal(cleared,1,'Sign-out closes the native watch');
 assert.equal(document.querySelector('.gps-badge').textContent,'GPS OFF');
 assert.ok(document.querySelector('.ride-live-metrics').textContent.includes('0.00'),'Sign-out clears the active ride when requested');
 assert.ok(!localStorage.getItem('echelon:gps'),'GPS history is not persisted');
 if(hostedDemo)assert.equal(backendRequests,0,'Hosted demo must make zero backend requests');
 console.log(`${hostedDemo?'Hosted demo':'Live dashboard'} integration passed: relevant chat, read-only questions, explicit commands, theme toggle, mobile navigation, opt-in GPS, Leaflet layers and sign-out cleanup.${hostedDemo?' No backend requests or sign-in required.':''}`);
}finally{
 await act(async()=>root.unmount());await server.close();globalThis.fetch=originalFetch;dom.window.close();
 for(const [key,descriptor] of replaced){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
