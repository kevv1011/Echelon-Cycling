import { routes } from '../data/routes.js';
import { dateInManila } from '../services/weatherApi.js';
import { clamp, duration, windRelation } from './cyclingPhysics.js';
export function parseCommand(text, ride, profile) {
  const t = text.toLowerCase(); const next = { ...ride }, rider = { ...profile }; const changes = [];
  const route = routes.find(r => ({ clark: /\bclark\b/, arayat: /\barayat\b/, subic: /\b(?:subic|kalaklan)\b/, monasterio: /\b(?:monasterio|tarlac)\b/ })[r.id].test(t));
  if (route) { Object.assign(next, { routeId: route.id, distance: route.distance, elevation: route.elevation, customRoute: null }); changes.push(route.name); }
  const number = regex => t.match(regex)?.[1];
  const km = number(/(\d+(?:\.\d+)?)\s*km\b/); if (km && next.routeId !== 'custom') { next.distance = clamp(+km, 5, 500); changes.push(`${next.distance} km`); }
  const bikeKg=number(/\bbike(?:\s+(?:weight|weighs|is|to|of|at))*\s*(\d+(?:\.\d+)?)\s*kg\b/)||number(/(\d+(?:\.\d+)?)\s*kg\s*bike\b/);
  if(bikeKg){rider.bikeWeight=clamp(+bikeKg,4,30);changes.push(`${rider.bikeWeight} kg bike`);}
  const kg = number(/(\d+(?:\.\d+)?)\s*kg\b/); if (kg&&kg!==bikeKg) { rider.riderWeight = clamp(+kg, 35, 180); changes.push(`${rider.riderWeight} kg rider`); }
  const ftp=number(/\bftp(?:\s+(?:is|to|of|at))*\s*(\d+)\s*w?\b/)||number(/(\d+)\s*w(?:atts)?\s*ftp\b/);
  if(ftp){rider.ftp=clamp(+ftp,50,600);changes.push(`${rider.ftp} W FTP`);}
  const mm = number(/(25|28|30|32)\s*(?:mm|c)\b/); if (mm) { rider.tireWidth = +mm; changes.push(`${mm} mm tires`); }
  if (/tubeless/.test(t)) { rider.tubeless = true; changes.push('tubeless'); } else if (/inner tubes?|with tubes|tubed/.test(t)) { rider.tubeless = false; changes.push('inner tubes'); }
  if (/\btempo\b/.test(t)) { next.effort = 'tempo'; changes.push('Tempo'); } else if (/\brace\b|\bdrop ride\b/.test(t)) { next.effort = 'race'; changes.push('Race effort'); } else if (/\bzone\s?2\b|\bz2\b|\bbase\b/.test(t)) { next.effort = 'z2'; changes.push('Zone 2'); }
  if (/\bwet\b|\bin (?:the )?rain\b|\brainy (?:ride|roads?|conditions)\b/.test(t)) { next.condition = 'wet'; changes.push('wet roads'); } else if (/\bdry\b/.test(t)) { next.condition = 'dry'; changes.push('dry roads'); }
  if (/tomorrow/.test(t)) { next.date = dateInManila(1); changes.push('tomorrow'); } else if (/today/.test(t)) { next.date = dateInManila(); changes.push('today'); }
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/); if (iso && !Number.isNaN(Date.parse(iso[1]))) next.date = iso[1];
  const time = t.match(/\b(\d{1,2})(?::([0-5]\d))\s*(am|pm)?\b/) || t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (time) { let hr = +time[1]; const mins = time.length === 3 ? '00' : time[2]; const suffix = time.length === 3 ? time[2] : time[3]; if (suffix && hr >= 1 && hr <= 12) hr = hr % 12 + (suffix === 'pm' ? 12 : 0); if (hr <= 23) { next.time = `${String(hr).padStart(2, '0')}:${mins || '00'}`; changes.push(`${next.time} start`); } }
  return { ride: next, profile: rider, changes };
}

// The Director runs locally: only supported ride requests reach the forecast/model.
export function directorRequest(text, ride, profile) {
  const t=text.trim().toLowerCase().replace(/[’]/g,"'");
  const reply=text=>({type:'reply',text});
  if(/^(?:(?:hi|hey|hello)[!,.\s]+)?how (?:are you|is it going|are things)[!?.\s]*$/.test(t))return reply('Ready to help you plan a ride! How’s your day going—checking the weather, dialing your setup, or planning some miles?');
  if(/^(?:hi|hello|hey|hiya|good morning|good afternoon|good evening|kumusta|kamusta)(?:\s+(?:there|director|echelon))?[!.,\s]*$/.test(t))return reply('Hey! Ready for a ride? I can help with wind, fueling, pacing and tire pressure. Ask a question, or try “Plan a 65km Clark ride tomorrow at 5:30 AM.”');
  if(/^(?:thanks?|thank you|cheers|salamat)(?:\s+(?:so much|a lot|director))?[!.,\s]*$/.test(t))return reply('You’re welcome! Anything else you want to check before rolling out?');
  if(/^(?:ok(?:ay)?|cool|nice|great|got it)[!.,\s]*$/.test(t))return reply('All set. Ask whenever you want to check your ride or change the plan.');
  if(/\b(?:who are you|are you (?:an? )?ai|how do you work|what can you do|help|commands)\b/.test(t))return reply('I’m Echelon’s local ride assistant. I answer supported cycling questions and calculate from your ride settings; I don’t use a general-purpose AI chat service. Try “How many gels do I need?”, “What’s the wind?”, “Why is rear PSI higher?” or “Set my ride to 60km at Tempo.” Questions preview a ride; explicit changes update the dashboard.');
  if(/\b(?:gps|geolocation|location permission|start recording|record (?:my |a )?ride|pause (?:my |the )?ride)\b/.test(t))return reply('Open the Ride section and tap Enable GPS or Start ride, then allow location access. Once an accurate fix arrives, actual movement updates the speed and distance. Pause or finish from that panel, and export GPS before closing the tab. Phones need HTTPS and may pause tracking in the background.');
  if(/\b(?:save|export|download)\b/.test(t))return reply('Use Save ride cue sheet to keep your plan, or Export cue sheet for text or print/PDF. Saved rides lets you reopen a plan. For an actual recorded track, use Export GPS in the Ride section before leaving the page.');
  if(/\b(?:safe|safer|safest|build|draw|custom)\b.*\b(?:route|map|road)\b|\b(?:route|map|road)\b.*\b(?:safe|safer|safest)\b/.test(t))return reply('Open Build my route to explore the map and place stops. In the full app, compare the shortest eligible path with an option favoring quieter mapped roads. The hosted demo supports map exploration; route comparison needs the full app. Lower mapped exposure is not a safety guarantee—review access, junctions and current conditions before riding.');
  if(/\b(?:which routes|available routes|route options)\b/.test(t))return reply('Start with Clark (42km), Arayat (85km), Subic (70km) or Monasterio (112km). Choose one on the Plan screen, or open Build my route to explore your own stops.');
  const parsed=parseCommand(text,ride,profile);
  const explicit=/^(?:(?:please|can you|could you|would you)(?:\s+please)?\s+)?(?:plan|set|switch|change|make|update|use|schedule)\b|^i(?:'m| am)?\s+(?:switching|changing|using|planning)\b/.test(t);
  const question=/\?|^(?:how|what|why|when|where|which|is|are|do|does|can|could|should|will|would|tell me|check)\b/.test(t);
  let topic=/\b(?:psi|pressure|tires?|tyres?|tubeless|tubes?)\b/.test(t)?'pressure':/\b(?:gels?|carbs?|carbohydrates?|fuel(?:ing)?|food|eat|nutrition)\b/.test(t)?'fuel':/\b(?:water|bottles?|drink|hydration|fluids?|sodium|electrolytes?)\b/.test(t)?'hydration':/\b(?:wind|headwind|tailwind|crosswind)\b/.test(t)?'wind':/\b(?:weather|forecast|rain|temperature|hot|heat|cold)\b/.test(t)?'weather':/\b(?:pace|pacing|speed|power|watts?|ftp|tempo|z2|zone 2|duration|long|finish)\b/.test(t)?'pace':null;
  if(explicit&&/\bplan\b/.test(t))topic='summary';
  if(!topic&&(parsed.changes.length||/\b(?:briefing|summari[sz]e|summary|ride plan)\b/.test(t)))topic='summary';
  if(!topic)return reply('I didn’t recognize a cycling request in that message. I can help with routes, weather, fuel, pacing and tire pressure. Try “What’s the wind?” or type “help” for examples. Your ride settings haven’t changed.');
  if(ride.routeId==='custom'&&/\b(?:set|make|change|update)\b/.test(t)&&/\d\s*km\b/.test(t))return reply('Your mapped distance comes from the selected roads. Open Build my route and edit the stops to change it; I won’t replace the mapped distance with a typed estimate.');
  return {type:'ride',topic,apply:explicit||!question,...parsed};
}

export function directorAnswer(topic, route, ride, profile, plan, weather, source, text='') {
  if(topic==='summary')return briefing(route,ride,profile,plan,weather,source,text);
  const context=`${route.name} · ${ride.distance} km · ${ride.time} PHT`;
  const label=source==='live'?'Open-Meteo forecast':source==='cached'?'Cached forecast; refresh failed':'Simulated weather; verify conditions before riding';
  if(topic==='pressure')return `${context}\n\n${/why.*rear|rear.*higher/i.test(text)?'The rear wheel carries more of the system load, so the model sets front pressure 9% lower. ':''}Your starting estimate is ${Math.round(plan.front)} PSI front / ${Math.round(plan.rear)} PSI rear for ${profile.tireWidth}mm ${profile.tubeless?'tubeless tires':'tires with tubes'} on ${plan.wet?'wet':'dry'} roads. Wider tires lower the model’s pressure; tubes add 8% and wet mode reduces it by 8%. Check your tire and rim limits—these are estimates, not measured pressures.`;
  if(topic==='fuel')return `${context}\n\nPlan for about ${plan.carbs} g of carbs per hour: ${plan.totalCarbs} g over an estimated ${duration(plan.hours)} moving. That is ${plan.gels} gels at 25 g each, or equivalent food and drink—not extra gels on top of those carbs. These are planning estimates; account for what you already carry.\n\n${label}.`;
  if(topic==='hydration')return `${context}\n\nThe planning model estimates ${plan.hydration.toFixed(1)} L total (${plan.fluidRate.toFixed(2)} L/hr), or ${plan.bottles} bottles at 750ml. Its sodium estimate is ${plan.sodiumRate} mg/hr. Plan refill stops and account for food/drink already carried; needs vary by rider and conditions.\n\n${label}.`;
  if(topic==='pace')return `${context}\n\nAt ${plan.effort}, the estimate is ${plan.speed.toFixed(1)} km/h, ${duration(plan.hours)} moving, and ${plan.powerLow}–${plan.powerHigh} W based on your ${profile.ftp} W FTP. This excludes stops and traffic. Power is a target estimate, not a connected sensor reading.\n\n${label}.`;
  const first=weather[0];
  if(!first)return `${context}\n\nNo forecast is available for this window. Refresh the weather panel or choose a date within the forecast range.`;
  if(topic==='wind')return `${context}\n\n${label}: ${first.wind} km/h from ${first.direction}° at ${first.time.slice(11,16)} PHT. That is a ${windRelation(first.direction,route.bearing,first.wind).type.toLowerCase()} on the route’s primary ${route.bearing}° heading. Direction is where wind comes from; exposure changes around the loop. Check the hourly panel for changes during the ride.`;
  return `${context}\n\n${label}: ${first.temp}°C, feels like ${first.feels}°C, ${first.rain}% rain probability and ${first.wind} km/h wind at ${first.time.slice(11,16)} PHT. Rain probability does not confirm wet roads. ${plan.heat>=32?'The selected window reaches at least 32°C feels-like; review the heat note and water stops.':'Use the hourly panel to review the rest of the ride window.'}`;
}
export function briefing(route, ride, profile, plan, weather, source, text = '') {
  if (/why.*rear|rear.*higher/i.test(text)) return 'Your rear wheel carries more of the system load. The model uses a 9% lower front pressure to balance tire deflection and grip. Your starting point is ' + `${plan.front.toFixed(0)} PSI front / ${plan.rear.toFixed(0)} PSI rear. Always stay within both tire and rim limits; hookless systems can have a lower pressure ceiling.`;
  const h = weather[0];
  const routeNote=ride.customRoute ? `\n\nROUTE REVIEW  ${ride.customRoute.kind==='quieter'?'Lower mapped exposure':'Shortest eligible'} route from OpenStreetMap. This is a road-tag estimate, not a safety guarantee. ${ride.customRoute.warnings.join(' ')} Climbing is your estimate. Edit map stops to change the mapped distance.` : '';
  return `${route.name} · ${ride.distance} km · ${ride.time} PHT\n\n${h ? `${source === 'live' ? 'Open-Meteo forecast' : source === 'cached' ? 'Cached Open-Meteo forecast (refresh failed)' : 'Simulated weather'}: ${h.temp}°C, feels like ${h.feels}°C, ${h.wind} km/h from ${h.direction}°, ${h.rain}% rain probability. ${windRelation(h.direction, route.bearing, h.wind).type} on the primary ${route.bearing}° heading; exposure changes around the loop.` : 'Forecast pending. These estimates will update when telemetry arrives.'}\n\nSETUP  ${Math.round(plan.front)} / ${Math.round(plan.rear)} PSI (${profile.tireWidth} mm ${profile.tubeless ? 'tubeless' : 'tubed'}; ${plan.wet ? 'wet' : 'dry'} roads).\nFUEL  ${plan.carbs} g carbs/hr · ${plan.gels} × 25 g gels total, or equivalent food. ${plan.bottles} × 750 ml bottles; ${plan.sodiumRate} mg sodium/hr. Plan a refill if needed.\nPACE  ${plan.powerLow}–${plan.powerHigh} W · ${duration(plan.hours)} moving · ${plan.speed.toFixed(1)} km/h estimate. ${ride.elevation > 700 ? 'Use a 1:1 low gear on the climbs.' : 'Keep cadence at 85–95 rpm.'}\n\n${plan.heat >= 32 ? 'HEAT CAUTION: Start early, ease the effort and arrange water stops.' : 'Roll out easy for 15 minutes. Leave room to adapt to the road.'}${routeNote}`;
}
