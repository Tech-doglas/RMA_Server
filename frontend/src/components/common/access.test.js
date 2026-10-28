import { apiFetch, canPermission, routeAllowed } from './access';

afterEach(() => localStorage.clear());
test('company-limited accounts cannot open inventory without company ownership', () => {
  localStorage.setItem('auth', JSON.stringify({ role: 'normal', permissions: ['return.view', 'pc.view', 'nonpc.view', 'xie.view', 'directory.view'] }));
  expect(routeAllowed('/return', 'normal')).toBe(true);
  for (const path of ['/pc', '/non-pc', '/xie']) expect(routeAllowed(path, 'normal')).toBe(false);
  expect(canPermission('directory.view')).toBe(false);
});
test('session credentials are never sent to unrelated origins', async () => {
  localStorage.setItem('auth', JSON.stringify({ token: 'private-session' }));
  const previous = global.fetch;
  global.fetch = jest.fn();
  try {
    await expect(apiFetch('https://untrusted.example/upload')).rejects.toThrow('server');
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = previous; }
});
test('department permissions control routes rather than department names or manager role', () => {
  localStorage.setItem('auth', JSON.stringify({ role: 'manager', department: 'Custom department', permissions: ['return.view'] }));
  expect(routeAllowed('/return', 'manager')).toBe(true);
  expect(routeAllowed('/return/ship', 'manager')).toBe(false);
  expect(routeAllowed('/admin', 'manager')).toBe(false);
  expect(routeAllowed('/return/settings', 'manager')).toBe(false);
  expect(routeAllowed('/pc', 'manager')).toBe(false);
  expect(canPermission('return.delete')).toBe(false);
  localStorage.setItem('auth', JSON.stringify({ role: 'normal', permissions: ['return.view', 'return.pallet_view'] }));
  expect(routeAllowed('/return/ship', 'normal')).toBe(true);
  expect(routeAllowed('/return/settings', 'normal')).toBe(false);
  expect(canPermission('return.ship')).toBe(false);
  localStorage.setItem('auth', JSON.stringify({ role: 'admin', permissions: [] }));
  expect(routeAllowed('/admin', 'admin')).toBe(true);
  expect(routeAllowed('/return/settings', 'admin')).toBe(true);
  expect(canPermission('return.delete')).toBe(true);
});

test('legacy requests include the real session token and retain request fields', async () => {
  const previous = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  try {
    localStorage.setItem('auth', JSON.stringify({ token: 'test-token' }));
    await apiFetch('http://localhost:8088/laptop/item/submit', { method: 'POST', body: 'test', headers: { 'Content-Type': 'text/plain' } });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8088/laptop/item/submit', expect.objectContaining({ method: 'POST', body: 'test', credentials: 'include', headers: { 'content-type': 'text/plain', authorization: 'Bearer test-token' } }));
  } finally { global.fetch = previous; }
});
