import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import useRideTelemetry from '../src/hooks/useRideTelemetry.js';
import useApiSession from '../src/hooks/useApiSession.js';
import {useClock} from '../src/hooks/useClock.js';
import {apiRequest,advanceAuthEpoch} from '../src/services/api.js';
import useTheme from '../src/hooks/useTheme.js';
import useMobileViewport from '../src/hooks/useMobileViewport.js';
import {readLocal,writeLocal} from '../src/services/storage.js';
import {setWorkspaceIdentity,getWorkspaceIdentity,clearWorkspace} from '../src/services/workspace.js';

test('browser copies remain private to each rider and never silently import demo data',async()=>{
 const env=setup();
 try{
  writeLocal('profile',{ftp:250});writeLocal('plans',[{id:'demo-plan'}]);
  setWorkspaceIdentity('rider-a');assert.equal(readLocal('profile',null),null);assert.deepEqual(readLocal('plans',[]),[]);
  writeLocal('profile',{ftp:300});writeLocal('plans',[{id:'a-plan'}]);
  setWorkspaceIdentity('rider-b');assert.equal(readLocal('profile',null),null);writeLocal('plans',[{id:'b-plan'}]);
  clearWorkspace('rider-a');assert.deepEqual(readLocal('plans',[]),[{id:'b-plan'}]);
  setWorkspaceIdentity(null);assert.equal(readLocal('profile',null).ftp,250);assert.equal(readLocal('plans',[])[0].id,'demo-plan');
 }finally{setWorkspaceIdentity(null);await env.cleanup();}
});

test('switching accounts resets the previous workspace before using the new account namespace',async()=>{
 const env=setup(),originalFetch=globalThis.fetch;let api,user='rider-a',clears=0;
 globalThis.fetch=async()=>new Response(JSON.stringify({authMode:'google',passwordRequired:true,authenticated:true,user:{id:user,name:user},sessionRemainingSeconds:1800}),{headers:{'Content-Type':'application/json'}});
 function Harness(){api=useApiSession();return null;}
 window.addEventListener('echelon:api-disconnected',event=>{if(event.detail?.identityChanged)clears++;});
 try{
  await act(async()=>env.root.render(React.createElement(Harness)));assert.equal(getWorkspaceIdentity(),'rider-a');
  user='rider-b';await act(async()=>api.refresh());
  assert.equal(clears,1);assert.equal(api.user.id,'rider-b');assert.equal(getWorkspaceIdentity(),'rider-b');
 }finally{globalThis.fetch=originalFetch;setWorkspaceIdentity(null);await env.cleanup();}
});

test('a delayed successful response from the previous account cannot update the new workspace',async()=>{
 const env=setup(),originalFetch=globalThis.fetch;let resolve,headers;
 setWorkspaceIdentity('rider-a');globalThis.fetch=(_url,options)=>{headers=options.headers;return new Promise(r=>resolve=r);};
 try{
  const pending=apiRequest('/profile');assert.equal(headers['X-Echelon-Account'],'rider-a');
  advanceAuthEpoch();setWorkspaceIdentity('rider-b');resolve(new Response(JSON.stringify({ftp:300})));
  await assert.rejects(pending,error=>error.status===409);
 }finally{globalThis.fetch=originalFetch;setWorkspaceIdentity(null);await env.cleanup();}
});

function setup(){
 setWorkspaceIdentity(null);
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:5173',pretendToBeVisual:true});
 const previous=new Map();
 const overrides={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true};
 for(const [key,value] of Object.entries(overrides)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 Object.defineProperty(window,'isSecureContext',{value:true});
 const root=createRoot(document.getElementById('root'));
 return {root,async cleanup(){await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}};
}
test('mounted GPS hook requests nothing until clicked, updates metrics, and stops on account lock',async()=>{
 const env=setup();let api,success,calls=0,cleared=[];
 Object.defineProperty(navigator,'geolocation',{value:{watchPosition:(s)=>{success=s;return calls++;},clearWatch:id=>cleared.push(id)},configurable:true});
 function Harness(){api=useRideTelemetry();return React.createElement('output',null,`${api.state.phase} / ${api.state.distanceM.toFixed(1)}`);}
 try{
  await act(async()=>env.root.render(React.createElement(Harness)));assert.equal(calls,0);
  await act(async()=>api.start());assert.equal(calls,1);assert.equal(api.state.phase,'arming');
  const at=Date.now();const point=(timestamp,latitude)=>({timestamp,coords:{latitude,longitude:120,accuracy:5,speed:4}});
  await act(async()=>success(point(at,15)));await act(async()=>success(point(at+1000,15.0001)));
  assert.equal(api.state.phase,'active');assert.ok(api.state.distanceM>11);assert.ok(document.querySelector('output').textContent.includes('11.1'));
  await act(async()=>window.dispatchEvent(new Event('echelon:signout-started')));
  assert.equal(api.state.gps,'off','A sign-out attempt stops location even before the server responds');
  await act(async()=>window.dispatchEvent(new Event('echelon:session-expired')));
  assert.equal(api.state.gps,'off');assert.equal(api.state.phase,'paused');assert.deepEqual(cleared,[0]);const retained=api.state.distanceM;
  await act(async()=>success(point(at+2000,15.0002)));assert.equal(api.state.distanceM,retained);
  await act(async()=>window.dispatchEvent(new CustomEvent('echelon:api-disconnected',{detail:{clearOffline:true}})));assert.equal(api.state.distanceM,0);assert.deepEqual(api.state.segments,[]);
 }finally{await env.cleanup();}
});
test('mounted GPS watch is cleared on unmount',async()=>{
 const env=setup();let api,cleared=0;
 Object.defineProperty(navigator,'geolocation',{value:{watchPosition:()=>7,clearWatch:id=>{assert.equal(id,7);cleared++;}},configurable:true});
 function Harness(){api=useRideTelemetry();return null;}
 await act(async()=>env.root.render(React.createElement(Harness)));await act(async()=>api.enableGps());await env.cleanup();assert.equal(cleared,1);
});
test('clock actually ticks and refreshes to the correct Manila time across midnight',async()=>{
 const env=setup();let latest;
 function Harness(){latest=useClock(10);return React.createElement('time',null,new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(latest.wall));}
 const original=Date.now;
 try{
  await act(async()=>env.root.render(React.createElement(Harness)));const first=latest.wall;
  await act(async()=>new Promise(resolve=>setTimeout(resolve,35)));assert.ok(latest.wall>first);
  let now=Date.parse('2026-10-17T15:59:59Z');Date.now=()=>now;
  await act(async()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(document.querySelector('time').textContent,'23:59:59');
  now+=1000;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(document.querySelector('time').textContent,'00:00:00');
 }finally{Date.now=original;await env.cleanup();}
});
test('a delayed authenticated status response cannot reopen a signed-out workspace',async()=>{
 const env=setup(),originalFetch=globalThis.fetch;let api;const requests=[];
 globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({resolve,url,options}));
 function Harness(){api=useApiSession();return React.createElement('output',null,String(api.authenticated));}
 const respond=(request,authenticated)=>request.resolve(new Response(JSON.stringify({passwordRequired:true,authenticated,sessionRemainingSeconds:authenticated?1800:null}),{headers:{'Content-Type':'application/json'}}));
 try{
  await act(async()=>env.root.render(React.createElement(Harness)));assert.equal(requests.length,1);assert.equal(requests[0].options.credentials,'include');
  await act(async()=>window.dispatchEvent(new Event('echelon:api-connected')));
  await act(async()=>respond(requests[0],false));assert.equal(requests.length,2);
  await act(async()=>respond(requests[1],true));assert.equal(api.authenticated,true);
  await act(async()=>{api.refresh();});assert.equal(requests.length,3);
  await act(async()=>window.dispatchEvent(new Event('echelon:api-disconnected')));assert.equal(api.authenticated,false);
  await act(async()=>respond(requests[2],true));assert.equal(api.authenticated,false);assert.equal(document.querySelector('output').textContent,'false');
 }finally{globalThis.fetch=originalFetch;await env.cleanup();}
});
test('client session deadline locks access instead of treating an old status as current forever',async()=>{
 const env=setup(),originalFetch=globalThis.fetch,originalNow=Date.now,originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval;let api,now=100000;const intervals=[];
 Date.now=()=>now;globalThis.setInterval=(callback,ms)=>{intervals.push({callback,ms});return intervals.length;};globalThis.clearInterval=()=>{};
 globalThis.fetch=async()=>new Response(JSON.stringify({passwordRequired:true,authenticated:true,sessionRemainingSeconds:1}),{headers:{'Content-Type':'application/json'}});
 function Harness(){api=useApiSession();return null;}
 try{
  await act(async()=>env.root.render(React.createElement(Harness)));assert.equal(api.authenticated,true);
  now+=2000;await act(async()=>intervals.find(i=>i.ms===5000).callback());assert.equal(api.authenticated,false);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;await env.cleanup();globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;}
});
test('a rejected request from an old session cannot lock a newly authenticated session',async()=>{
 const env=setup(),originalFetch=globalThis.fetch;let resolve,expired=0;
 globalThis.fetch=()=>new Promise(r=>resolve=r);window.addEventListener('echelon:session-expired',()=>expired++);
 try{const old=apiRequest('/profile');advanceAuthEpoch();resolve(new Response(JSON.stringify({detail:'Expired old session'}),{status:401,headers:{'Content-Type':'application/json'}}));await assert.rejects(old);assert.equal(expired,0);}finally{globalThis.fetch=originalFetch;await env.cleanup();}
});
test('sign-out in another tab immediately locks this tab too',async()=>{
 const env=setup(),originalFetch=globalThis.fetch;let api,notifications=0;
 globalThis.fetch=async()=>new Response(JSON.stringify({passwordRequired:true,authenticated:true,sessionRemainingSeconds:1800}),{headers:{'Content-Type':'application/json'}});
 function Harness(){api=useApiSession();return null;}
 try{await act(async()=>env.root.render(React.createElement(Harness)));assert.equal(api.authenticated,true);window.addEventListener('echelon:api-disconnected',()=>notifications++);await act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'echelon:auth-event',newValue:JSON.stringify({type:'disconnected',clearOffline:true})})));assert.equal(api.authenticated,false);assert.equal(notifications,1);}finally{globalThis.fetch=originalFetch;await env.cleanup();}
});

test('theme follows the system initially and persists an explicit choice across mounts',async()=>{
 const env=setup(),previous=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');let api;
 const media={matches:true,addEventListener(){},removeEventListener(){}};
 Object.defineProperty(globalThis,'matchMedia',{value:()=>media,writable:true,configurable:true});
 function Harness(){api=useTheme();return null;}
 try{
  await act(async()=>env.root.render(React.createElement(Harness)));assert.equal(document.documentElement.dataset.theme,'light');
  await act(async()=>api.toggleTheme());assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(localStorage.getItem('echelon:theme'),'dark');
  await act(async()=>env.root.render(React.createElement(Harness,{key:'reload'})));assert.equal(api.theme,'dark','Stored choice wins over light system preference');
  localStorage.removeItem('echelon:theme');await act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:'echelon:theme'})));assert.equal(api.theme,'light');
 }finally{await env.cleanup();if(previous)Object.defineProperty(globalThis,'matchMedia',previous);else delete globalThis.matchMedia;}
});

test('visible viewport tracks a phone keyboard and removes listeners on unmount',async()=>{
 const env=setup(),viewport=new window.EventTarget();Object.assign(viewport,{height:800,scale:1});Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
 function Harness(){useMobileViewport();return React.createElement('textarea',{'aria-label':'Chat'});}
 try{
  await act(async()=>env.root.render(React.createElement(Harness)));
  assert.equal(document.documentElement.style.getPropertyValue('--viewport-height'),'800px');
  const input=document.querySelector('textarea');Object.defineProperty(document,'activeElement',{get:()=>input,configurable:true});viewport.height=430;viewport.dispatchEvent(new Event('resize'));
  assert.equal(document.documentElement.style.getPropertyValue('--viewport-height'),'430px');assert.equal(document.documentElement.hasAttribute('data-keyboard-open'),true);
  viewport.height=800;viewport.dispatchEvent(new Event('resize'));assert.equal(document.documentElement.hasAttribute('data-keyboard-open'),false);
  await act(async()=>env.root.render(null));viewport.height=400;viewport.dispatchEvent(new Event('resize'));assert.equal(document.documentElement.style.getPropertyValue('--viewport-height'),'');
 }finally{await env.cleanup();}
});
