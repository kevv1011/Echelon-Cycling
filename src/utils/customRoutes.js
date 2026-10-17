export function routeBearing(geometry) {
  const [a,b] = geometry; const rad = d => d * Math.PI / 180;
  const dlon=rad(b[1]-a[1]), lat1=rad(a[0]), lat2=rad(b[0]);
  return (Math.atan2(Math.sin(dlon)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dlon))*180/Math.PI+360)%360;
}
export function validGeometry(geometry) {return Array.isArray(geometry)&&geometry.length>=2&&geometry.length<=12000&&geometry.every(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Math.abs(p[0])<=85&&Number.isFinite(p[1])&&Math.abs(p[1])<=180);}
export function customRouteMetadata(candidate, waypoints, name, fetchedAt) {
  if(!validGeometry(candidate.geometry))throw new Error('Invalid route geometry');
  const middle=candidate.geometry[Math.floor(candidate.geometry.length/2)];
  return {name:name.trim().slice(0,100)||'My cycling route',geometry:candidate.geometry,waypoints,stats:candidate.stats,warnings:candidate.warnings,fetchedAt,kind:candidate.id,lat:middle[0],lon:middle[1],bearing:Math.round(routeBearing(candidate.geometry))};
}
const escapeXml = s => String(s).replace(/[<>&"']/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function routeGpx(name, geometry) {
  if(!validGeometry(geometry))throw new Error('Invalid route geometry');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Echelon" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(name)}</name><desc>OpenStreetMap road-tag route for scouting. No live closures or turn restrictions. Verify access and junctions. Not a safety guarantee.</desc></metadata><trk><name>${escapeXml(name)}</name><trkseg>${geometry.map(([lat,lon])=>`<trkpt lat="${lat}" lon="${lon}"/>`).join('')}</trkseg></trk></gpx>`;
}
export function downloadGpx(name, geometry) {
  const url=URL.createObjectURL(new Blob([routeGpx(name,geometry)],{type:'application/gpx+xml'}));const link=document.createElement('a');link.href=url;link.download='echelon-custom-route.gpx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function recordingGpx(name,segments){const valid=segments.filter(s=>s.length>=2);if(!valid.length||valid.some(s=>!validGeometry(s)))throw new Error('No valid recorded GPS track');return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Echelon" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(name)}</name><desc>GPS recorded in this browser. Up to the latest 5000 points; earlier geometry may be omitted. Pauses and signal gaps are separate track segments. Check privacy before sharing.</desc></metadata><trk><name>${escapeXml(name)}</name>${valid.map(s=>`<trkseg>${s.map(([lat,lon])=>`<trkpt lat="${lat}" lon="${lon}"/>`).join('')}</trkseg>`).join('')}</trk></gpx>`;}
