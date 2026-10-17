import { efforts } from '../data/routes.js';
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export function windRelation(direction, bearing, speed) {
  const angle = (direction - bearing) * Math.PI / 180;
  const head = speed * Math.cos(angle), cross = Math.abs(speed * Math.sin(angle));
  return { head, cross, type: cross > Math.abs(head) ? 'Crosswind' : head > 0 ? 'Headwind' : 'Tailwind' };
}
export function calculatePlan(profile, ride, weather = []) {
  const effort = efforts[ride.effort] || efforts.z2;
  const weight = profile.riderWeight + profile.bikeWeight;
  const avgWind = weather.length ? weather.reduce((s, h) => s + h.wind, 0) / weather.length : 0;
  const heat = weather.length ? Math.max(...weather.map(h => h.feels)) : 27;
  const wet = ride.condition === 'wet' || (ride.condition === 'auto' && weather.some(h => h.rain >= 50));
  const power = Math.round(profile.ftp * effort.factor);
  // Solve steady-state wheel power: aero + rolling + average positive climbing.
  // A loop has no net headwind: use a conservative wind exposure cost instead.
  const wind = avgWind / 3.6 * 0.35;
  const grade = ride.elevation / (ride.distance * 1000) * 0.55;
  let lo = 1, hi = 20;
  for (let i = 0; i < 45; i++) {
    const v = (lo + hi) / 2;
    const required = (0.5 * 1.18 * 0.32 * (v * v + wind * wind) + weight * 9.81 * (0.0045 + grade)) * v / 0.97;
    if (required > power) hi = v; else lo = v;
  }
  const speed = (lo + hi) / 2 * 3.6;
  const hours = ride.distance / speed;
  const rear = clamp(67 * (weight / 76.5) * (28 / profile.tireWidth) ** 1.65 * (profile.tubeless ? 1 : 1.08) * (wet ? 0.92 : 1), 30, 110);
  const front = rear * 0.91;
  const carbs = effort.carbs + (hours > 3 ? 5 : 0);
  const fluidRate = clamp(0.5 + (heat - 24) * 0.035, 0.45, 1.1);
  const hydration = fluidRate * hours;
  const sodiumRate = heat >= 32 ? 800 : heat >= 28 ? 650 : 500;
  const kj = power * hours * 3.6;
  return { front, rear, wet, speed, hours, heat, power, powerLow: Math.round(profile.ftp * effort.low), powerHigh: Math.round(profile.ftp * effort.high), carbs, totalCarbs: Math.ceil(carbs * hours), gels: Math.ceil(carbs * hours / 25), hydration, fluidRate, bottles: Math.ceil(hydration / 0.75), sodium: Math.round(sodiumRate * hours), sodiumRate, kj: Math.round(kj), calories: Math.round(kj), effort: effort.short };
}
export function duration(hours) { const min = Math.round(hours * 60); return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`; }
