// Account identity is a non-secret cache namespace, never an authentication token.
let identity = null;
export const getWorkspaceIdentity = () => identity;
export function setWorkspaceIdentity(value) { identity = value || null; }
export function workspaceKey(key, owner=identity) {
  return ['profile','plans'].includes(key) && owner ? `echelon:account:${owner}:${key}` : `echelon:${key}`;
}
export function clearWorkspace(owner=identity) {
  for (const key of ['profile','plans']) localStorage.removeItem(workspaceKey(key,owner));
}
