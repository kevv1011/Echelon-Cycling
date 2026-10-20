import { validatedApiBase } from '../utils/apiConfig.js';
import {getWorkspaceIdentity} from './workspace.js';
export const API_BASE = validatedApiBase(import.meta.env?.VITE_API_URL || '');
export const hostedDemo = import.meta.env?.VITE_HOSTED_DEMO === 'true';
export const accountsEnabled = !hostedDemo && import.meta.env?.VITE_ACCOUNTS_ENABLED === 'true';
export const usesBackend = !hostedDemo && (accountsEnabled || import.meta.env?.VITE_USE_MOCK_API === 'false');
let authEpoch=0;
export const getAuthEpoch=()=>authEpoch;
export const advanceAuthEpoch=()=>++authEpoch;
export function notifyAuthChange(type,clearOffline=false){
  try{localStorage.setItem('echelon:auth-event',JSON.stringify({type,clearOffline,at:Date.now(),nonce:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${authEpoch}`}));}catch{}
  window.dispatchEvent(new CustomEvent(`echelon:api-${type}`,{detail:{clearOffline}}));
}
export class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
export async function apiRequest(path, options = {}) {
  if(hostedDemo)throw new ApiError('This feature is available in the full app, outside the browser demo.',503);
  const startedEpoch=authEpoch;
  const owner=getWorkspaceIdentity();
  const res = await fetch(`${API_BASE}/api${path}`, { credentials: 'include', signal: AbortSignal.timeout(10000), ...options, headers: { 'Content-Type': 'application/json', ...(owner?{'X-Echelon-Account':owner}:{}), ...options.headers } });
  if(startedEpoch!==authEpoch)throw new ApiError('Your account changed. Try again in the current workspace.',409);
  if (!res.ok) {
    if(res.status===401&&path!=='/auth/login'&&startedEpoch===authEpoch&&typeof window!=='undefined')window.dispatchEvent(new Event('echelon:session-expired'));
    let detail; try { detail = (await res.json()).detail; } catch {}
    if(res.status===409&&typeof detail==='string'&&detail.startsWith('Account changed')&&startedEpoch===authEpoch&&typeof window!=='undefined')window.dispatchEvent(new Event('echelon:api-connected'));
    throw new ApiError(typeof detail === 'string' ? detail : `Request rejected (${res.status}). Check the route inputs.`, res.status);
  }
  const data=res.status === 204 ? null : await res.json();
  if(startedEpoch!==authEpoch)throw new ApiError('Your account changed. Try again in the current workspace.',409);
  return data;
}
