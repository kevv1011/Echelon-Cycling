import {API_BASE,getAuthEpoch} from './api.js';
const manilaParts=date=>{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const part=type=>parts.find(p=>p.type===type).value;
  return {date:`${part('year')}-${part('month')}-${part('day')}`,time:`${part('hour')}:${part('minute')}`};
};
export const dateInManila = (offset = 0) => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(x => x.type === type).value;
  const d = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
export function demoWeather(ride, count) {
  const start = new Date(`${ride.date}T${ride.time}:00+08:00`);
  start.setUTCMinutes(0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const time = new Date(start.getTime() + i * 3600000);
    const hour = (time.getUTCHours() + 8) % 24;
    const temp = Math.round(26 + 4 * Math.sin((hour - 6) / 12 * Math.PI));
    const local=manilaParts(time);
    return { time: `${local.date}T${local.time}`, temp, feels: temp + 3, rain: [12, 15, 20, 24, 18][i % 5], wind: [9, 11, 14, 12, 10][i % 5], direction: (45 + i * 12) % 360 };
  });
}
export async function fetchWeather(route, ride, count, signal) {
  const startedEpoch=getAuthEpoch();
  const end = new Date(`${ride.date}T${ride.time}:00+08:00`);
  end.setUTCHours(end.getUTCHours() + count);
  const endDate = manilaParts(end).date;
  const params = new URLSearchParams({ latitude: route.lat, longitude: route.lon, hourly: 'temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,wind_direction_10m', wind_speed_unit: 'kmh', timezone: 'Asia/Manila', start_date: ride.date, end_date: endDate });
  const endpoint = import.meta.env?.VITE_USE_MOCK_API === 'false' ? `${API_BASE}/api/weather` : 'https://api.open-meteo.com/v1/forecast';
  const res = await fetch(`${endpoint}?${params}`, { signal, ...(import.meta.env?.VITE_USE_MOCK_API === 'false' ? { credentials: 'include' } : {}) });
  if(res.status===401&&startedEpoch===getAuthEpoch()&&typeof window!=='undefined')window.dispatchEvent(new Event('echelon:session-expired'));
  if (!res.ok) throw new Error('Forecast unavailable for this date');
  const { hourly: h } = await res.json();
  const target = `${ride.date}T${ride.time.slice(0, 2)}:00`;
  const start = h.time.findIndex(t => t >= target);
  if (start < 0 || h.time.length - start < count) throw new Error('Forecast window unavailable');
  const result = h.time.slice(start, start + count).map((time, i) => {
    const n = i + start;
    return { time, temp: h.temperature_2m[n], feels: h.apparent_temperature[n], rain: h.precipitation_probability[n], wind: h.wind_speed_10m[n], direction: h.wind_direction_10m[n] };
  });
  if (result.some(h => Object.entries(h).some(([k, v]) => k !== 'time' && !Number.isFinite(v)))) throw new Error('Incomplete weather response');
  return result;
}
