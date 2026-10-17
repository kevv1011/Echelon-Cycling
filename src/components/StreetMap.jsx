import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
const EMPTY=[];
export default function StreetMap({ center, waypoints=EMPTY, candidates=EMPTY, selected, onPoint, readOnly=false, snapped=EMPTY,position=null,positionLive=false,follow=false,track=EMPTY }) {
  const container=useRef(null), map=useRef(null), leaflet=useRef(null), layers=useRef(null), handler=useRef(onPoint),locationLayer=useRef(null),trackLayer=useRef(null),marker=useRef(null),accuracy=useRef(null),didFollow=useRef(false);
  const [ready,setReady]=useState(false),[error,setError]=useState('');
  handler.current=onPoint;
  useEffect(()=>{let cancelled=false;import('leaflet').then(module=>{
    if(cancelled)return;const L=module.default;leaflet.current=L;
    const instance=L.map(container.current,{scrollWheelZoom:false,attributionControl:true}).setView(center,13);map.current=instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(instance).on('tileerror',()=>{if(!cancelled)setError('Map tiles unavailable. Coordinate entry and route comparison remain available.');});
    layers.current=L.layerGroup().addTo(instance);
    locationLayer.current=L.layerGroup().addTo(instance);trackLayer.current=L.layerGroup().addTo(instance);
    if(!readOnly)instance.on('click',e=>{const {lat,lng}=e.latlng;if(Math.abs(lat)<=80&&Math.abs(lng)<=180)handler.current?.({lat:+lat.toFixed(6),lon:+lng.toFixed(6)});});
    const resized=()=>{if(!cancelled)instance.invalidateSize();};
    if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(resized);observer.observe(container.current);instance._echelonResize=observer;}else{window.addEventListener('resize',resized);instance._echelonResize={disconnect:()=>window.removeEventListener('resize',resized)};}
    setReady(true);instance.invalidateSize();
  }).catch(()=>{if(!cancelled)setError('Map could not load. Use coordinate entry below.');});
    return()=>{cancelled=true;map.current?._echelonResize?.disconnect();map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{if(!ready||!layers.current)return;const L=leaflet.current;layers.current.clearLayers();
    const ordered=[...candidates].sort((a,b)=>(a.id===selected?1:0)-(b.id===selected?1:0));
    ordered.forEach(c=>L.polyline(c.geometry,{color:c.id==='quieter'?'#10b981':'#f59e0b',weight:c.id===selected?5:3,opacity:c.id===selected?.95:.4}).addTo(layers.current));
    snapped.forEach((p,i)=>{if(!waypoints[i])return;L.polyline([[waypoints[i].lat,waypoints[i].lon],p],{color:'#f1f5f9',weight:2,dashArray:'3 5'}).addTo(layers.current);L.circleMarker(p,{radius:3,color:'#fff',fillColor:'#17291e',fillOpacity:1,weight:1.5}).addTo(layers.current);});
    waypoints.forEach((p,i)=>L.marker([p.lat,p.lon],{icon:L.divIcon({className:'waypoint-icon',html:`<span>${i+1}</span>`,iconSize:[26,26],iconAnchor:[13,13]}),keyboard:true,title:`Stop ${i+1}`,alt:`Stop ${i+1}`}).addTo(layers.current));
    const chosen=candidates.find(c=>c.id===selected);if(chosen?.geometry.length)map.current.fitBounds(chosen.geometry,{padding:[25,25],maxZoom:16});
  },[ready,waypoints,candidates,selected,snapped]);
  useEffect(()=>{if(ready&&!position&&!track.some(s=>s.length>=2)&&!candidates.find(c=>c.id===selected)?.geometry?.length)map.current.setView(center,13);},[ready,center[0],center[1],candidates,selected,!!position,track]);
  useEffect(()=>{if(ready&&!position&&track.some(s=>s.length>=2))map.current.fitBounds(track.flat(),{padding:[20,20],maxZoom:16});},[ready,!!position,track]);
  useEffect(()=>{if(!ready||!locationLayer.current)return;const L=leaflet.current;if(!position){locationLayer.current.clearLayers();marker.current=null;accuracy.current=null;didFollow.current=false;return;}const point=[position.lat,position.lon],color=positionLive?'#3b82f6':'#87929d';
    if(!marker.current){accuracy.current=L.circle(point,{radius:Math.min(position.accuracy,5000),color,fillColor:color,fillOpacity:.1,weight:1}).addTo(locationLayer.current);marker.current=L.circleMarker(point,{radius:7,color:'#f3f4f6',fillColor:color,fillOpacity:1,weight:2}).addTo(locationLayer.current);}else{marker.current.setLatLng(point).setStyle({fillColor:color});accuracy.current.setLatLng(point).setRadius(Math.min(position.accuracy,5000)).setStyle({color,fillColor:color});}
    if(follow&&positionLive){if(!didFollow.current){map.current.setView(point,Math.max(map.current.getZoom(),15));didFollow.current=true;}else map.current.panTo(point,{animate:false});}
  },[ready,position,positionLive,follow]);
  useEffect(()=>{if(!ready||!trackLayer.current)return;trackLayer.current.clearLayers();track.filter(s=>s.length>=2).forEach(segment=>leaflet.current.polyline(segment,{color:'#58a6ff',weight:4,opacity:.85}).addTo(trackLayer.current));},[ready,track]);
  return <div className="street-map-shell"><div ref={container} className="street-map" aria-label={readOnly?'Custom cycling route street map':'Street map: click to add route stops'} role="region"/>{!ready&&!error&&<div className="map-loading">Loading street map…</div>}{error&&<div className="map-tile-error" role="status">{error}</div>}</div>;
}
