async function req(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

// Paged endpoints take { page, pageSize, fresh, line } and answer
// { items, page, pageCount, total, exact }. `line` scopes the history to one of our
// numbers — the server filters to records with it at either end.
function paged(path, { page, pageSize, fresh, line } = {}) {
  const qs = new URLSearchParams();
  if (page) qs.set('page', page);
  if (pageSize) qs.set('pageSize', pageSize);
  if (fresh) qs.set('fresh', '1');
  if (line) qs.set('line', line);
  const query = qs.toString();
  return req(query ? `${path}?${query}` : path);
}

export const api = {
  login: (email, password) => req('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/api/logout', { method: 'POST' }),
  me: () => req('/api/me'),
  token: () => req('/api/token'),
  sms: (opts) => paged('/api/sms', opts),
  sendSms: (to, body, from) => req('/api/sms', { method: 'POST', body: JSON.stringify({ to, body, from }) }),
  calls: (opts) => paged('/api/calls', opts),
  lines: () => req('/api/lines'),
  addLine: (number, label) => req('/api/lines', { method: 'POST', body: JSON.stringify({ number, label }) }),
  updateLine: (id, fields) => req(`/api/lines/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  removeLine: (id) => req(`/api/lines/${id}`, { method: 'DELETE' }),
  twilioNumbers: () => req('/api/twilio-numbers'),
};

export const recordingMedia = (sid) => `/api/recordings/${sid}/media`;
