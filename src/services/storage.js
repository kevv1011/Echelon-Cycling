import { apiRequest as request, usesBackend } from './api.js';
import {workspaceKey} from './workspace.js';
export const demoMode = !usesBackend;
export function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(workspaceKey(key))) ?? fallback; } catch { return fallback; } }
export function writeLocal(key, value) { localStorage.setItem(workspaceKey(key), JSON.stringify(value)); }
export const loadProfile = () => request('/profile');
export async function saveProfile(profile) {
  writeLocal('profile', profile);
  if (demoMode) return { offline: false };
  try { await request('/profile', { method: 'PUT', body: JSON.stringify(profile) }); return { offline: false }; }
  catch (error) { if(error.status===401||error.status===403||error.status===409)throw error;return { offline: true }; }
}
export const loadPlans = () => request('/plans');
export async function savePlan(plan) {
  const plans = readLocal('plans', []); writeLocal('plans', [plan, ...plans].slice(0, 50));
  if (demoMode) return { offline: false };
  try { await request('/plans', { method: 'POST', body: JSON.stringify(plan) }); return { offline: false }; }
  catch (error) { if(error.status===401||error.status===403||error.status===409)throw error;return { offline: true }; }
}
