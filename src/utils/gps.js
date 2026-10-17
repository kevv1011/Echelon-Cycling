export const FIX_MAX_AGE = 15000;
export const MAX_ACCURACY = 50;
export const MAX_TRACK_POINTS = 5000;
function boundedTrack(segments){let size=segments.reduce((n,s)=>n+s.length,0);const truncated=size>MAX_TRACK_POINTS;while(size>MAX_TRACK_POINTS&&segments.length){if(segments[0].length<=size-MAX_TRACK_POINTS){size-=segments.shift().length;}else{segments[0]=segments[0].slice(size-MAX_TRACK_POINTS);size=MAX_TRACK_POINTS;}}return {segments,truncated};}
export function metersBetween(a,b) {
  const rad=d=>d*Math.PI/180, p=rad(a.lat), q=rad(b.lat);
  const v=Math.sin((q-p)/2)**2+Math.cos(p)*Math.cos(q)*Math.sin(rad(b.lon-a.lon)/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(v)));
}
export function normalizeFix(position,now=Date.now()) {
  const c=position?.coords,t=position?.timestamp;
  if(!c||!Number.isFinite(c.latitude)||Math.abs(c.latitude)>90||!Number.isFinite(c.longitude)||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||!Number.isFinite(t)||t>now+5000||now-t>FIX_MAX_AGE)return null;
  return {lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,timestamp:t,speed:Number.isFinite(c.speed)&&c.speed>=0&&c.speed<=45?c.speed:null};
}
export function freshFix(fix,now=Date.now()) {return !!fix&&now-fix.timestamp<=FIX_MAX_AGE&&now>=fix.timestamp-5000&&fix.accuracy<=MAX_ACCURACY;}
export function gpsStatus(state,now=Date.now()) {
  if(state.gps!=='watching')return state.gps;
  if(!state.fix)return 'requesting';
  if(now-state.fix.timestamp>FIX_MAX_AGE)return 'stale';
  return state.fix.accuracy>MAX_ACCURACY?'weak':'live';
}
export function initialRideTelemetry(){return {phase:'idle',gps:'off',fix:null,anchor:null,speed:null,activeMs:0,activeSince:null,movingMs:0,distanceM:0,segments:[],trackTruncated:false,breakTrack:true,discardedFixes:0,notice:''};}
export function activeElapsed(state,monotonicNow){return state.activeMs+(state.phase==='active'?Math.max(0,monotonicNow-state.activeSince):0);}
export function startRecording(state,mono,wall){
  const base=state.phase==='finished'?{...initialRideTelemetry(),gps:state.gps,fix:state.fix}:state;
  if(base.phase==='active'||base.phase==='arming')return base;
  const ready=freshFix(base.fix,wall)&&base.gps==='watching';
  const track=boundedTrack(ready?[...base.segments,[[base.fix.lat,base.fix.lon]]]:[...base.segments]);
  return {...base,phase:ready?'active':'arming',activeSince:ready?mono:null,anchor:ready?base.fix:null,segments:track.segments,trackTruncated:base.trackTruncated||track.truncated,breakTrack:!ready,notice:ready?'Recording GPS ride.':'Waiting for an accurate GPS fix before starting the timer.'};
}
export function pauseRecording(state,mono){return {...state,phase:state.phase==='arming'?(state.activeMs?'paused':'idle'):'paused',activeMs:activeElapsed(state,mono),activeSince:null,anchor:null,breakTrack:true};}
export function ingestFix(state,raw,wall,mono) {
  const fix=normalizeFix(raw,wall);
  if(!fix||state.fix&&fix.timestamp<=state.fix.timestamp)return {...state,discardedFixes:state.discardedFixes+1};
  if(fix.accuracy>MAX_ACCURACY)return {...state,fix,gps:'watching',anchor:null,speed:null,breakTrack:true,notice:'GPS accuracy is too low. Distance is not being added.'};
  let next={...state,fix,gps:'watching',notice:'',speed:fix.speed===null?null:fix.speed*3.6};
  if(state.phase==='arming')next={...next,phase:'active',activeSince:mono,anchor:fix,breakTrack:true};
  if(next.phase!=='active')return next;
  let delta=0,moving=0;
  const anchor=state.phase==='active'?state.anchor:null;
  if(anchor){
    const dt=(fix.timestamp-anchor.timestamp)/1000;
    const gap=metersBetween(anchor,fix), noise=Math.max(5,Math.min(15,(fix.accuracy+anchor.accuracy)*.3));
    if(dt>0&&dt<=15&&gap/dt>45)return {...state,fix:null,anchor:null,speed:null,breakTrack:true,discardedFixes:state.discardedFixes+1,notice:'GPS jump ignored. Waiting for the next reliable fix.'};
    if(dt>0&&dt<=15){
      const velocity=fix.speed??gap/dt;
      if(gap>=noise&&velocity>=1){delta=gap;moving=dt*1000;next.speed=velocity*3.6;}
      else if(fix.speed===null)next.speed=0;
      // Accumulate small displacement from the same anchor, not one jitter sample at a time.
      if(!delta&&dt<10)next.anchor=anchor;else next.anchor=fix;
    }else{next.anchor=fix;next.breakTrack=true;}
  }else next.anchor=fix;
  const segments=next.segments.map(s=>s);
  const point=[fix.lat,fix.lon];
  if(next.breakTrack||!segments.length){segments.push([point]);next.breakTrack=false;}
  else if(delta){segments[segments.length-1]=[...segments.at(-1),point];}
  const track=boundedTrack(segments);
  return {...next,segments:track.segments,trackTruncated:state.trackTruncated||track.truncated,distanceM:state.distanceM+delta,movingMs:state.movingMs+moving};
}
export function nearestRouteDistance(fix,geometry){
  if(!fix||!geometry?.length)return null;
  const cos=Math.cos(fix.lat*Math.PI/180),scale=111195;
  let nearest=Infinity;
  for(let i=1;i<geometry.length;i++){
    const a=geometry[i-1],b=geometry[i];
    const ax=(a[1]-fix.lon)*cos*scale,ay=(a[0]-fix.lat)*scale,bx=(b[1]-fix.lon)*cos*scale,by=(b[0]-fix.lat)*scale;
    const dx=bx-ax,dy=by-ay,denom=dx*dx+dy*dy;
    const t=denom?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/denom)):0;
    nearest=Math.min(nearest,Math.hypot(ax+t*dx,ay+t*dy));
  }
  return Number.isFinite(nearest)?nearest:null;
}
export function createLocationWatch({geolocation,secure,onFix,onError}) {
  if(!secure){onError({code:0,message:'GPS needs HTTPS or localhost. Open the secure site and try again.'});return ()=>{};}
  if(!geolocation?.watchPosition){onError({code:0,message:'This browser does not support geolocation.'});return ()=>{};}
  let closed=false,id;
  const stop=()=>{if(!closed){closed=true;if(id!==undefined)geolocation.clearWatch(id);}};
  try{id=geolocation.watchPosition(p=>{if(!closed)onFix(p);},e=>{if(!closed){onError(e);if(e.code===1)stop();}},{enableHighAccuracy:true,maximumAge:0,timeout:15000});if(closed&&id!==undefined)geolocation.clearWatch(id);}
  catch{stop();onError({code:0,message:'Location access failed. Check browser permissions and try again.'});}
  return stop;
}
export function timerText(ms){const seconds=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
