import {useCallback,useEffect,useRef,useState} from 'react';
import {activeElapsed,createLocationWatch,initialRideTelemetry,ingestFix,pauseRecording,startRecording} from '../utils/gps.js';
export default function useRideTelemetry(){
  const [state,setState]=useState(initialRideTelemetry),stop=useRef(null);
  const enableGps=useCallback((force=false)=>{if(stop.current){if(!force)return;stop.current();stop.current=null;}setState(s=>({...s,gps:'requesting',anchor:force?null:s.anchor,breakTrack:force||s.breakTrack,notice:'Allow location access in the browser to use GPS.'}));
    let denied=false;
    const cleanup=createLocationWatch({geolocation:navigator.geolocation,secure:window.isSecureContext,onFix:p=>setState(s=>ingestFix(s,p,Date.now(),performance.now())),onError:e=>{if(e.code===0||e.code===1)denied=true;setState(s=>({...s,gps:e.code===1?'denied':e.code===3?'timeout':'unavailable',anchor:null,speed:null,breakTrack:true,notice:e.code===1?'Location permission denied. Enable it in your browser site settings, then retry.':e.code===3?'GPS timed out. Move outdoors; the active watch can recover.':e.message||'Location is unavailable. Try outdoors or check device settings.'}));if(e.code===0||e.code===1)stop.current=null;}});
    if(!denied)stop.current=cleanup;else cleanup();
  },[]);
  const stopGps=useCallback(()=>{stop.current?.();stop.current=null;setState(s=>({...(['active','arming'].includes(s.phase)?pauseRecording(s,performance.now()):s),gps:'off',fix:null,anchor:null,speed:null,notice:'GPS stopped. Location is no longer being watched.'}));},[]);
  useEffect(()=>()=>stop.current?.(),[]);
  useEffect(()=>{window.addEventListener('echelon:signout-started',stopGps);return()=>window.removeEventListener('echelon:signout-started',stopGps);},[stopGps]);
  useEffect(()=>{const locked=e=>{stopGps();if(e.detail?.clearOffline)setState(initialRideTelemetry());};window.addEventListener('echelon:api-disconnected',locked);window.addEventListener('echelon:session-expired',locked);return()=>{window.removeEventListener('echelon:api-disconnected',locked);window.removeEventListener('echelon:session-expired',locked);};},[stopGps]);
  const start=()=>{setState(s=>startRecording(s,performance.now(),Date.now()));enableGps();};
  const pause=()=>setState(s=>pauseRecording(s,performance.now()));
  const finish=()=>{stop.current?.();stop.current=null;setState(s=>({...s,phase:'finished',activeMs:activeElapsed(s,performance.now()),activeSince:null,anchor:null,gps:'off',fix:null,speed:null,breakTrack:true,notice:'Ride finished. The track remains only in this tab until you export or clear it.'}));};
  const reset=()=>setState(s=>({...initialRideTelemetry(),gps:s.gps,fix:s.fix}));
  return {state,enableGps,stopGps,start,pause,finish,reset};
}
