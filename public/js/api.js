// REST API wrappers.
async function http(path, options = {}) {
  const r = await fetch(path, {
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export const api = {
  state: () => http('/api/state'),
  scan: (p) => http('/api/scan', { method: 'POST', body: JSON.stringify({ path: p }) }),
  browse: (dir) => http(`/api/browse?dir=${encodeURIComponent(dir)}`),
  pathSpace: (p) => http(`/api/path-space?path=${encodeURIComponent(p)}`),
  jobs: {
    list: () => http('/api/jobs'),
    get: (id) => http(`/api/jobs/${id}`),
    create: (body) => http('/api/jobs', { method: 'POST', body: JSON.stringify(body) }),
    start: (id) => http(`/api/jobs/${id}/start`, { method: 'POST' }),
    cancel: (id) => http(`/api/jobs/${id}/cancel`, { method: 'POST' }),
    remove: (id) => http(`/api/jobs/${id}`, { method: 'DELETE' }),
    removeFinished: () => http('/api/jobs', { method: 'DELETE' }),
    eject: (id, sourceId) =>
      http(`/api/jobs/${id}/eject`, { method: 'POST', body: JSON.stringify({ sourceId }) })
  },
  settings: {
    get: () => http('/api/settings'),
    save: (body) => http('/api/settings', { method: 'PUT', body: JSON.stringify(body) })
  },
  downloadUrl: (jobId, index) => `/api/download/${jobId}?i=${index}`
};
