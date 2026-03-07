const BASE = '';

export async function fetchOverview(params = {}) {
  const q = new URLSearchParams();
  if (params.editor) q.set('editor', params.editor);
  const qs = q.toString();
  const res = await fetch(`${BASE}/api/overview${qs ? '?' + qs : ''}`);
  return res.json();
}

export async function fetchChats(params = {}) {
  const q = new URLSearchParams();
  if (params.editor) q.set('editor', params.editor);
  if (params.folder) q.set('folder', params.folder);
  if (params.limit) q.set('limit', params.limit);
  if (params.offset) q.set('offset', params.offset);
  if (params.named === false) q.set('named', 'false');
  const res = await fetch(`${BASE}/api/chats?${q}`);
  return res.json();
}

export async function fetchChat(id) {
  const res = await fetch(`${BASE}/api/chats/${id}`);
  return res.json();
}

export async function fetchProjects() {
  const res = await fetch(`${BASE}/api/projects`);
  return res.json();
}

export async function fetchDailyActivity(params = {}) {
  const q = new URLSearchParams();
  if (params.editor) q.set('editor', params.editor);
  const qs = q.toString();
  const res = await fetch(`${BASE}/api/daily-activity${qs ? '?' + qs : ''}`);
  return res.json();
}

export async function fetchDeepAnalytics(params = {}) {
  const q = new URLSearchParams();
  if (params.editor) q.set('editor', params.editor);
  if (params.folder) q.set('folder', params.folder);
  if (params.limit) q.set('limit', params.limit);
  const res = await fetch(`${BASE}/api/deep-analytics?${q}`);
  return res.json();
}

export function refetchAgents(onProgress) {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`${BASE}/api/refetch`);
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.done) { es.close(); resolve(data); }
        else if (data.error) { es.close(); reject(new Error(data.error)); }
        else if (onProgress) onProgress(data);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => { es.close(); reject(new Error('SSE error')); };
  });
}

export async function fetchToolCalls(name, opts = {}) {
  const q = new URLSearchParams({ name });
  if (opts.limit) q.set('limit', opts.limit);
  if (opts.folder) q.set('folder', opts.folder);
  const res = await fetch(`${BASE}/api/tool-calls?${q}`);
  return res.json();
}
