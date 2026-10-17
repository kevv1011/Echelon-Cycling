import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wind, ArrowUpRight, Navigation, MapPin, Flag, Sun, CloudSun, CloudRain, Droplets, Gauge, CircleDot, Zap, ArrowUp, Mountain, Timer } from 'lucide-react';
import { duration, windRelation } from '../utils/cyclingPhysics.js';
import StreetMap from './StreetMap.jsx';
import {SyncAge} from './LiveStatus.jsx';
export function Count({ value, decimals = 0 }) {
  const [n, setN] = useState(value); const previous = useRef(value);
  useEffect(() => { const start = performance.now(), from = previous.current; let frame; const tick = now => { const p = Math.min(1, (now - start) / 550); setN(from + (value - from) * (1 - (1 - p) ** 3)); if (p < 1) frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); previous.current = value; return () => cancelAnimationFrame(frame); }, [value]);
  return <>{n.toFixed(decimals)}</>;
}
export function RouteMap({ route, ride, weather, plan }) {
  const h = weather[0];
  const candidates=useMemo(()=>route.id==='custom'?[{id:route.kind,geometry:route.geometry}]:[],[route]);
  if(route.id==='custom')return <section className="panel custom-route-overview"><div className="panel-header"><h2><MapPin size={15}/>{route.name}</h2><span className="small-tag"><span className="dot green"/>{route.kind==='quieter'?'LOWER MAPPED EXPOSURE':'SHORTEST ELIGIBLE'}</span></div><StreetMap center={[route.lat,route.lon]} waypoints={route.waypoints} candidates={candidates} selected={route.kind} readOnly/><div className="custom-route-summary"><span><strong>{ride.distance.toFixed(1)}</strong> km mapped</span><span><strong>{ride.elevation}</strong> m estimated</span><span>{duration(plan.hours)} moving</span></div><p className="custom-route-caution">Road-tag comparison, not a safety guarantee. Check access, intersections and current conditions. Missing road tags: {route.stats.unknownPct}%.</p></section>;
  return <section className="route-map panel" aria-label="Route overview schematic">
    <div className="map-grid"/>
    <svg className="map-art" viewBox="0 0 540 300" role="img" aria-label={`${route.name} schematic, not a navigational track`}>
      <defs><pattern id="terrain" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M-10 30Q15 0 40 25T85 20M-10 40Q15 10 40 35T85 30" fill="none" stroke="#273128" strokeWidth=".65"/></pattern></defs>
      <path d="M0 0H205L170 65 125 91 98 160 48 210 0 202Z" fill="url(#terrain)"/><path d="M340 0H540V300H420L440 220 405 175 419 114Z" fill="url(#terrain)"/>
      <g stroke="#272b30" fill="none" strokeWidth="1.2"><path d="M20 240L504 82M12 135L500 273M100 0L285 300M400 0L245 300M0 78L540 189M66 300L350 0M0 206L540 34"/><path d="M84 46L459 243M84 280L485 150M185 0L339 300M290 0L450 300" strokeWidth=".65"/></g>
      <path d="M490 0C458 68 475 87 455 129S473 207 448 300" stroke="#24323a" strokeWidth="7" fill="none"/>
      <g fill="#5a646d" fontSize="8" fontFamily="Inter, sans-serif" letterSpacing="1.3"><text x="222" y="143">{route.id === 'clark' ? 'CLARK FREEPORT' : route.id === 'arayat' ? 'MT. ARAYAT' : route.id === 'subic' ? 'SUBIC BAY' : 'SAN JOSE'}</text><text x="311" y="265">{route.id === 'monasterio' ? 'TARLAC' : 'ANGELES CITY'}</text><text x="49" y="94" transform="rotate(-49 49 94)">CENTRAL LUZON</text></g>
      <path d={route.shape} stroke="#f59e0b" strokeWidth="10" opacity=".07" fill="none" strokeLinejoin="round"/><path d={route.shape} stroke="#f5ac32" strokeWidth="3" fill="none" strokeLinejoin="round"/>
      <path d="M292 66l7 5-8 5" fill="none" stroke="#fbd391" strokeWidth="2"/>
      <circle cx={route.id === 'clark' ? 135 : route.id === 'arayat' ? 129 : route.id === 'subic' ? 152 : 205} cy={route.id === 'clark' ? 186 : route.id === 'arayat' ? 202 : route.id === 'subic' ? 233 : 245} r="7" fill="#101317" stroke="#f59e0b" strokeWidth="3"/>
    </svg>
    <div className="map-top"><span className="small-tag"><span className="dot amber"/> ROUTE SCHEMATIC</span><span className="map-coordinate">{route.lat.toFixed(3)}°N {route.lon.toFixed(3)}°E</span></div>
    <div className="map-compass"><span>N</span><Navigation size={18} fill="currentColor"/></div>
    <div className="map-wind"><Wind size={17}/><span>{h ? <><Count value={h.wind} decimals={1}/> km/h</> : '—'}<small>WIND FROM {h?.direction ?? '—'}°</small></span><ArrowUpRight size={18} style={{transform:`rotate(${(h?.direction ?? 45) - 45}deg)`}}/></div>
    <div className="map-label"><MapPin size={12}/>{route.region}<span>NOT FOR NAVIGATION</span></div>
    <div className="route-summary"><div><span>DISTANCE</span><strong><Count value={ride.distance}/><small> km</small></strong></div><div><span>ELEVATION</span><strong><Count value={ride.elevation}/><small> m</small></strong></div><div><span>EST. MOVING TIME</span><strong>{duration(plan.hours)}</strong></div><div><span>EFFORT</span><strong className="effort-label">{plan.effort}</strong></div></div>
  </section>;
}
export function WeatherPanel({ weather, route, loading, source, refresh, error, fetchedAt, checkedAt }) {
  const [active, setActive] = useState(0); const current = weather[Math.min(active, weather.length - 1)];
  useEffect(() => { setActive(i => Math.max(0, Math.min(i, weather.length - 1))); }, [weather.length]);
  const relation = current ? windRelation(current.direction, route.bearing, current.wind) : null;
  return <section className="panel weather-panel"><div className="panel-header"><h2><Wind size={16}/> Wind & weather window</h2><button className="text-button" onClick={refresh} disabled={loading}>{loading ? 'SYNCING…' : 'REFRESH ↻'}</button></div>
    <div className={`weather-hours ${loading ? 'loading' : ''}`} aria-busy={loading}>{weather.map((h, i) => { const Icon = h.rain >= 50 ? CloudRain : h.rain > 20 ? CloudSun : Sun; return <button className={`weather-hour ${i === active ? 'selected' : ''}`} key={h.time} onClick={() => setActive(i)} aria-pressed={i === active}><span className="hour">{h.time.slice(11,16)}</span><Icon size={23} className={h.rain >= 50 ? 'muted' : 'sun-icon'}/><strong>{Math.round(h.temp)}<small>°</small></strong><span className="rain"><Droplets size={10}/>{h.rain}%</span><span className="hour-wind"><ArrowUp size={12} style={{transform:`rotate(${(h.direction + 180) % 360}deg)`}}/>{Math.round(h.wind)} <small>km/h</small></span></button>; })}</div>
    <div className="weather-detail"><span><span className={`dot ${source === 'live' ? 'green' : 'amber'}`}/>{source === 'live' ? 'Open-Meteo forecast' : source === 'cached' ? 'Cached Open-Meteo' : 'Demo weather'}<span className="divider">/</span>PHT (UTC+8)</span><span className={current?.feels >= 32 ? 'amber-text' : ''}>Feels {current?.feels ?? '—'}°C {current?.feels >= 32 ? '· HEAT CAUTION' : '· WARM'}</span></div>
    <div className="forecast-freshness"><span>FORECAST SYNC / EVERY 10 MIN</span><SyncAge at={source==='demo'?checkedAt:fetchedAt}/></div>
    <div className="wind-advisory"><div className="wind-icon"><Wind size={18}/></div><p><strong>{relation?.type || 'Checking conditions'}{relation?.cross >= 10 ? ' · Echelon risk' : ''}</strong><span>{relation ? `On the primary ${route.bearing}° heading. Wind changes relative to your direction around the loop.` : 'Waiting for weather telemetry.'}</span></p></div>
    {error && <p className="weather-error">{source==='cached'?'Refresh failed. The last real forecast is retained; verify conditions.':'Live forecast unavailable. Simulated values shown; refresh to retry.'}</p>}
  </section>;
}
export function PhysicsCards({ plan, profile, ride }) {
  return <div className="physics-grid"><section className="panel physics-card"><div className="metric-heading"><CircleDot size={17}/><h2>Tire pressure</h2><span>01</span></div><div className="pressure-pair"><div><span>FRONT</span><strong><Count value={plan.front}/><small> PSI</small></strong><em>{(plan.front / 14.5038).toFixed(1)} bar</em></div><span className="pair-slash">/</span><div><span>REAR</span><strong><Count value={plan.rear}/><small> PSI</small></strong><em>{(plan.rear / 14.5038).toFixed(1)} bar</em></div></div><div className="tire-visual"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><i>PRESSURE BALANCED</i></div><div className="metric-bottom"><span>{profile.tireWidth} mm · {profile.tubeless ? 'Tubeless' : 'Inner tube'}</span><span className={plan.wet ? 'amber-text' : 'green-text'}>{plan.wet ? 'WET ROAD' : 'DRY ROAD'}</span></div></section>
    <section className="panel physics-card"><div className="metric-heading"><Droplets size={17}/><h2>Fuel & hydration</h2><span>02</span></div><div className="primary-metric"><strong><Count value={plan.carbs}/></strong><span>g carbs<small>PER HOUR</small></span><div className="mini-bars">{[11,19,15,27,23,31,27].map((h,i)=><i key={i} style={{height:h}}/>)}</div></div><div className="fuel-detail"><span>{plan.gels} <small>× 25 g gels</small></span><span>{plan.bottles} <small>× 750 ml</small></span></div><div className="metric-bottom"><span>{plan.calories.toLocaleString()} kJ / ≈ kcal</span><span>{plan.sodiumRate} mg Na/hr</span></div></section>
    <section className="panel physics-card"><div className="metric-heading"><Gauge size={17}/><h2>Pacing strategy</h2><span>03</span></div><div className="primary-metric"><strong><Count value={plan.speed} decimals={1}/></strong><span>km/h<small>EST. AVERAGE</small></span></div><div className="power-zone"><span className="green-text">{plan.powerLow}–{plan.powerHigh} W</span><span>{plan.effort}</span></div><div className="metric-bottom"><span>{ride.elevation > 700 ? '1:1 low gear advised' : '85–95 rpm cadence'}</span><Zap size={12}/></div></section></div>;
}
