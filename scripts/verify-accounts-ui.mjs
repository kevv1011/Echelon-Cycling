// Integration check with fake identity/API data; no Google login or real GPS.
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {createServer} from 'vite';
process.env.VITE_ACCOUNTS_ENABLED='true';process.env.VITE_HOSTED_DEMO='false';process.env.VITE_USE_MOCK_API='false';process.env.VITE_API_URL='';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:5173',pretendToBeVisual:true});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const previous=new Map();
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,localStorage:dom.window.localStorage,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,requestAnimationFrame:callback=>setTimeout(()=>callback(performance.now()),16),cancelAnimationFrame:id=>clearTimeout(id),IS_REACT_ACT_ENVIRONMENT:true})){
 previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
}
const profile={riderWeight:68,bikeWeight:8.5,tireWidth:28,tubeless:true,ftp:240};
localStorage.setItem('echelon:profile',JSON.stringify({...profile,ftp:350}));
localStorage.setItem('echelon:plans',JSON.stringify([{id:'demo-plan'}]));
let user=null,imports=0,logout=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const path=new URL(String(input),'http://localhost:5173').pathname;let data;
 if(path==='/api/auth/status')data={authMode:'google',passwordRequired:true,authenticated:!!user,user,sessionRemainingSeconds:user?1800:null};
 else if(path==='/api/profile'){assert.equal(options.headers['X-Echelon-Account'],user.id);data=profile;}
 else if(path==='/api/plans'){assert.equal(options.headers['X-Echelon-Account'],user.id);data=[];}
 else if(path==='/api/weather')throw new Error('Use labeled demo forecast in this test');
 else if(path==='/api/auth/logout'){logout++;user=null;return new Response(null,{status:204});}
 else if(path==='/api/account/import'){imports++;data={imported:1,skipped:0};}
 else if(path==='/api/auth/activity')data={sessionRemainingSeconds:1800};
 else throw new Error(`Unexpected endpoint ${path}`);
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
const server=await createServer({server:{middlewareMode:true},appType:'custom'}),root=createRoot(document.getElementById('root'));
const flush=()=>new Promise(resolve=>setTimeout(resolve,50));
const click=async node=>{assert.ok(node);await act(async()=>{node.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));await flush();});};
try{
 const {default:App}=await server.ssrLoadModule('/src/App.jsx');
 await act(async()=>{root.render(React.createElement(App));await flush();});
 assert.equal(document.querySelector('a[href="/api/auth/google"]').textContent,'Continue with Google');
 assert.ok(!document.querySelector('.app-shell'),'Unauthenticated accounts cannot see private workspace');
 user={id:'rider-a',name:'Rider A',email:'a@example.com'};
 await act(async()=>{window.dispatchEvent(new Event('echelon:api-connected'));await flush();});
 assert.ok(document.querySelector('.app-shell'));assert.ok(document.querySelector('.access-button').textContent.includes('Rider A'));
 assert.equal(imports,0,'Signing in never uploads browser demo data');
 await click(document.querySelector('.access-button'));
 assert.ok(document.querySelector('.api-access').textContent.includes('a@example.com'));
 const importButton=[...document.querySelectorAll('button')].find(node=>node.textContent==='Import selected data');
 assert.equal(importButton.disabled,true,'Import requires an explicit selection');
 await click(document.querySelector('.api-access fieldset input'));
 assert.equal(importButton.disabled,false);
 await click(importButton);assert.equal(imports,1);
 await click([...document.querySelectorAll('button')].find(node=>node.textContent==='Sign out'));
 assert.equal(logout,1);assert.ok(!document.querySelector('.app-shell'));
 assert.ok(localStorage.getItem('echelon:profile'),'Signing out preserves unrelated demo copies');
 console.log('Account UI checks passed: Google link, locked workspace, rider identity, explicit import and sign-out.');
}finally{
 await act(async()=>root.unmount());await server.close();globalThis.fetch=originalFetch;dom.window.close();
 for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}
