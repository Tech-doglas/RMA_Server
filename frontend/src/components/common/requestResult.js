// Keep transport failures separate from empty results and successful saves.
export async function requireOk(response) {
  if (response.ok) return response;
  let message = '';
  try {
    const data = await response.json();
    message = typeof data.error === 'string' ? data.error : '';
  } catch (_) { /* Do not show an HTML error page or server trace in the UI. */ }
  const fallback = response.status === 401 ? 'Your session has expired. Please sign in again.'
    : response.status === 403 ? 'You do not have permission to perform this action.'
    : response.status === 404 ? 'This record is no longer available.'
    : 'Unable to complete the request. Please try again.';
  const error = new Error(response.status >= 500 ? fallback : message || fallback);
  error.status = response.status;
  throw error;
}

export async function readJson(response) {
  await requireOk(response);
  return response.json();
}

export async function readList(response) {
  const data = await readJson(response);
  if (!Array.isArray(data)) throw new Error('Unable to load the list. Please try again.');
  return data;
}
