const originalApiUrl = process.env.REACT_APP_API_URL;
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.REACT_APP_API_URL = '/api';
  jest.resetModules();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
});
afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.REACT_APP_API_URL;
  else process.env.REACT_APP_API_URL = originalApiUrl;
  global.fetch = originalFetch;
  localStorage.clear();
});

test('NAS login uses the website address and includes cookies', async () => {
  const { authApi } = require('./access');
  await authApi('/login', { method: 'POST' });
  expect(global.fetch).toHaveBeenCalledWith(window.location.origin + '/api/auth/api/login', expect.objectContaining({ credentials: 'include', method: 'POST' }));
});

test('older inventory requests move from port 8088 to the NAS API path', async () => {
  const { apiFetch } = require('./access');
  await apiFetch(`http://${window.location.hostname}:8088/non_laptop/item/api/12?detail=1`);
  expect(global.fetch).toHaveBeenCalledWith(window.location.origin + '/api/non_laptop/item/api/12?detail=1', expect.anything());
});

test('3PL and photo URLs use the same authenticated NAS address', async () => {
  const { receivingApi, SERVER } = require('../ReturnReceiving/receivingApi');
  await receivingApi('/units');
  expect(global.fetch).toHaveBeenCalledWith(window.location.origin + '/api/return/units', expect.anything());
  expect(SERVER + '/images/return_units/12/test.jpg').toBe('/api/images/return_units/12/test.jpg');
});
