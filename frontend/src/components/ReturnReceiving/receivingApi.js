import { apiFetch } from '../common/access';
export const SERVER = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:8088`;
export function receivingAuth() {
  try { return JSON.parse(localStorage.getItem('auth') || '{}'); }
  catch { return {}; }
}
export async function receivingApi(path, options = {}) {
  const auth = receivingAuth();
  const response = await apiFetch(`${SERVER}/return${path}`, { ...options, headers: { ...options.headers, ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {}) } });
  const data = await response.json().catch(() => {
    throw new Error(response.status === 413 ? 'This delivery has too many photo uploads. Choose fewer photos or smaller files.' : 'The receiving server returned an unexpected response. Try again.');
  });
  if (!response.ok || data.error) throw new Error(data.error || 'Unable to complete this request.');
  return data;
}
export const postJson = (path, payload) => receivingApi(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function statusOf(item) {
  return item.quantityKnown === 0 ? 'Quantity to confirm' : item.shipDate ? 'Shipped' : item.inspectionDate ? 'Inspected' : 'Awaiting inspection';
}
