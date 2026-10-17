import { validatedApiBase } from '../utils/apiConfig.js';
export const API_BASE = validatedApiBase(import.meta.env?.VITE_API_URL || '');
let authEpoch=0;
export const getAuthEpoch=()=>authEpoch;
export const advanceAuthEpoch=()=>++authEpoch;
export function notifyAuthChange(type,clearOffline=false){
  try{localStorage.setItem('echelon:auth-event',JSON.stringify({type,clearOffline,at:Date.now(),nonce:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${authEpoch}`}));}catch{}
  window.dispatchEvent(new CustomEvent(`echelon:api-${type}`,{detail:{clearOffline}}));
}
export class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
export async function apiRequest(path, options = {}) {
  const startedEpoch=authEpoch;
  const res = await fetch(`${API_BASE}/api${path}`, { credentials: 'include', signal: AbortSignal.timeout(10000), ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!res.ok) {
    if(res.status===401&&path!=='/auth/login'&&startedEpoch===authEpoch&&typeof window!=='undefined')window.dispatchEvent(new Event('echelon:session-expired'));
    let detail; try { detail = (await res.json()).detail; } catch {}
    throw new ApiError(typeof detail === 'string' ? detail : `Request rejected (${res.status}). Check the route inputs.`, res.status);
  }
  return res.status === 204 ? null : res.json();
}
