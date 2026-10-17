import { routes } from '../data/routes.js';
import { dateInManila } from '../services/weatherApi.js';
import { clamp, duration, windRelation } from './cyclingPhysics.js';
export function parseCommand(text, ride, profile) {
  const t = text.toLowerCase(); const next = { ...ride }, rider = { ...profile }; const changes = [];
  const route = routes.find(r => ({ clark: /clark/, arayat: /arayat/, subic: /subic|kalaklan/, monasterio: /monasterio|tarlac/ })[r.id].test(t));
  if (route) { Object.assign(next, { routeId: route.id, distance: route.distance, elevation: route.elevation, customRoute: null }); changes.push(route.name); }
  const number = regex => t.match(regex)?.[1];
  const km = number(/(\d+(?:\.\d+)?)\s*km\b/); if (km && next.routeId !== 'custom') { next.distance = clamp(+km, 5, 500); changes.push(`${next.distance} km`); }
  const kg = number(/(\d+(?:\.\d+)?)\s*kg\b/); if (kg) { rider.riderWeight = clamp(+kg, 35, 180); changes.push(`${rider.riderWeight} kg rider`); }
  const mm = number(/(25|28|30|32)\s*(?:mm|c)\b/); if (mm) { rider.tireWidth = +mm; changes.push(`${mm} mm tires`); }
  if (/tubeless/.test(t)) { rider.tubeless = true; changes.push('tubeless'); } else if (/inner tubes?|with tubes|tubed/.test(t)) { rider.tubeless = false; changes.push('inner tubes'); }
  if (/tempo/.test(t)) { next.effort = 'tempo'; changes.push('Tempo'); } else if (/race|drop ride/.test(t)) { next.effort = 'race'; changes.push('Race effort'); } else if (/zone\s?2|z2|base/.test(t)) { next.effort = 'z2'; changes.push('Zone 2'); }
  if (/wet|rain/.test(t)) { next.condition = 'wet'; changes.push('wet roads'); } else if (/dry/.test(t)) { next.condition = 'dry'; changes.push('dry roads'); }
  if (/tomorrow/.test(t)) { next.date = dateInManila(1); changes.push('tomorrow'); } else if (/today/.test(t)) { next.date = dateInManila(); changes.push('today'); }
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/); if (iso && !Number.isNaN(Date.parse(iso[1]))) next.date = iso[1];
  const time = t.match(/\b(\d{1,2})(?::([0-5]\d))\s*(am|pm)?\b/) || t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (time) { let hr = +time[1]; const mins = time.length === 3 ? '00' : time[2]; const suffix = time.length === 3 ? time[2] : time[3]; if (suffix && hr >= 1 && hr <= 12) hr = hr % 12 + (suffix === 'pm' ? 12 : 0); if (hr <= 23) { next.time = `${String(hr).padStart(2, '0')}:${mins || '00'}`; changes.push(`${next.time} start`); } }
  return { ride: next, profile: rider, changes };
}
export function briefing(route, ride, profile, plan, weather, source, text = '') {
  if (/why.*rear|rear.*higher/i.test(text)) return 'Your rear wheel carries more of the system load. The model uses a 9% lower front pressure to balance tire deflection and grip. Your starting point is ' + `${plan.front.toFixed(0)} PSI front / ${plan.rear.toFixed(0)} PSI rear. Always stay within both tire and rim limits; hookless systems can have a lower pressure ceiling.`;
  const h = weather[0];
  const routeNote=ride.customRoute ? `\n\nROUTE REVIEW  ${ride.customRoute.kind==='quieter'?'Lower mapped exposure':'Shortest eligible'} route from OpenStreetMap. This is a road-tag estimate, not a safety guarantee. ${ride.customRoute.warnings.join(' ')} Climbing is your estimate. Edit map stops to change the mapped distance.` : '';
  return `${route.name} · ${ride.distance} km · ${ride.time} PHT\n\n${h ? `${source === 'live' ? 'Open-Meteo forecast' : source === 'cached' ? 'Cached Open-Meteo forecast (refresh failed)' : 'Simulated weather'}: ${h.temp}°C, feels like ${h.feels}°C, ${h.wind} km/h from ${h.direction}°, ${h.rain}% rain probability. ${windRelation(h.direction, route.bearing, h.wind).type} on the primary ${route.bearing}° heading; exposure changes around the loop.` : 'Forecast pending. These estimates will update when telemetry arrives.'}\n\nSETUP  ${Math.round(plan.front)} / ${Math.round(plan.rear)} PSI (${profile.tireWidth} mm ${profile.tubeless ? 'tubeless' : 'tubed'}; ${plan.wet ? 'wet' : 'dry'} roads).\nFUEL  ${plan.carbs} g carbs/hr · ${plan.gels} × 25 g gels total, or equivalent food. ${plan.bottles} × 750 ml bottles; ${plan.sodiumRate} mg sodium/hr. Plan a refill if needed.\nPACE  ${plan.powerLow}–${plan.powerHigh} W · ${duration(plan.hours)} moving · ${plan.speed.toFixed(1)} km/h estimate. ${ride.elevation > 700 ? 'Use a 1:1 low gear on the climbs.' : 'Keep cadence at 85–95 rpm.'}\n\n${plan.heat >= 32 ? 'HEAT CAUTION: Start early, ease the effort and arrange water stops.' : 'Roll out easy for 15 minutes. Leave room to adapt to the road.'}${routeNote}`;
}
