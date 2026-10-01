export const API_SERVER = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:8088`;
export function authState() {
  try { const value = JSON.parse(localStorage.getItem('auth') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
export function canPermission(action) {
  const auth = authState();
  return auth.role === 'admin' || (Array.isArray(auth.permissions) && auth.permissions.includes(action));
}
export function apiFetch(url, options = {}) {
  const auth = authState();
  const server = new URL(API_SERVER, window.location.origin);
  let target = new URL(url, server);
  // Older screens use the local API address; honor the configured HTTPS server there too.
  if (target.hostname === window.location.hostname && target.port === '8088' &&
      (target.origin !== server.origin || (server.pathname !== '/' && !target.pathname.startsWith(server.pathname.replace(/\/$/, '') + '/')))) {
    target = new URL(server.href.replace(/\/$/, '') + target.pathname + target.search);
  }
  if (target.origin !== server.origin) return Promise.reject(new Error('The request is not addressed to this application’s server.'));
  const headers = new Headers(options.headers || {});
  if (auth.token) headers.set('Authorization', 'Bearer ' + auth.token);
  return fetch(target.href, { ...options, credentials: 'include', headers: Object.fromEntries(headers.entries()) });
}
export async function authApi(path, options = {}) {
  const response = await apiFetch(API_SERVER + '/auth/api' + path, options);
  const data = await response.json().catch(() => ({ error: 'The server returned an unexpected response. Please try again.' }));
  if (!response.ok) { const error = new Error(data.error || 'Unable to complete request.'); error.status = response.status; throw error; }
  return data;
}
export function routeAllowed(path, role) {
  if (path === '/' || path === '/register' || path === '/dashboard') return true;
  if (path === '/admin' || path === '/return/admin' || path === '/return/settings') return role === 'admin';
  if (path === '/return/manage') return ['return.edit', 'return.delete', 'return.classify', 'return.inspect', 'return.restore', 'return.export'].some(canPermission) && canPermission('return.view');
  if (path.startsWith('/return/admin/')) return ['return.edit', 'return.delete'].some(canPermission) && canPermission('return.view');
  if (path.startsWith('/return/edit/')) return canPermission('legacy.edit');
  if (path === '/return/input') return canPermission('return.receive');
  if (path === '/return/ship') return canPermission('return.pallet_view') || canPermission('return.ship') || canPermission('return.pallet_status');
  if (path === '/return/report') return canPermission('return.report');
  if (path.startsWith('/return/legacy')) return canPermission('legacy.view');
  if (path.startsWith('/return')) return canPermission('return.view');
  const scope = path.startsWith('/non-pc') ? 'nonpc' : path.startsWith('/pc') ? 'pc' : path.startsWith('/xie') ? 'xie' : '';
  if (scope) return canPermission(scope + (path.endsWith('/input') ? '.create' : path.endsWith('/edit') ? '.edit' : path.endsWith('/sales') ? '.sell' : path.endsWith('/request') ? '.request' : '.view'));
  if (path === '/manager-tools') return canPermission('pc.report');
  return false;
}
