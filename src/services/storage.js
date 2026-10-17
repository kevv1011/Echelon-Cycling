import { apiRequest as request } from './api.js';
export const demoMode = import.meta.env?.VITE_USE_MOCK_API !== 'false';
export function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(`echelon:${key}`)) ?? fallback; } catch { return fallback; } }
export function writeLocal(key, value) { localStorage.setItem(`echelon:${key}`, JSON.stringify(value)); }
export const loadProfile = () => request('/profile');
export async function saveProfile(profile) {
  writeLocal('profile', profile);
  if (demoMode) return { offline: false };
  try { await request('/profile', { method: 'PUT', body: JSON.stringify(profile) }); return { offline: false }; }
  catch { return { offline: true }; }
}
export const loadPlans = () => request('/plans');
export async function savePlan(plan) {
  const plans = readLocal('plans', []); writeLocal('plans', [plan, ...plans].slice(0, 50));
  if (demoMode) return { offline: false };
  try { await request('/plans', { method: 'POST', body: JSON.stringify(plan) }); return { offline: false }; }
  catch { return { offline: true }; }
}
