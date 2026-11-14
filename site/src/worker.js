// NotchIsland site: file statici (public/) + download dell'installer da R2 (i file statici dei Worker sono limitati a 25 MB).
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), geolocation=(), payment=()',
};

async function download(request, env) {
  const rel = await (await env.ASSETS.fetch(new URL('/release.json', request.url))).json();
  const key = rel.file; const range = request.headers.get('range');
  const obj = await env.DOWNLOADS.get(key, range ? { range: request.headers } : undefined);
  if (!obj) return new Response('Installer not found', { status: 404 });
  const h = new Headers(SECURITY); obj.writeHttpMetadata(h); h.set('etag', obj.httpEtag); h.set('accept-ranges', 'bytes');
  h.set('content-type', 'application/vnd.microsoft.portable-executable'); h.set('content-disposition', `attachment; filename="${key}"`); h.set('cache-control', 'public, max-age=3600');
  if (obj.range) { const { offset = 0, length = obj.size - offset } = obj.range; h.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`); h.set('content-length', String(length)); return new Response(request.method === 'HEAD' ? null : obj.body, { status: 206, headers: h }); }
  h.set('content-length', String(obj.size));
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/download' || url.pathname === '/download/latest' || url.pathname.startsWith('/download/NotchIsland-Setup-')) return download(request, env);
    const res = await env.ASSETS.fetch(request);
    const h = new Headers(res.headers); for (const [k, v] of Object.entries(SECURITY)) h.set(k, v);
    if (url.pathname.startsWith('/demo/') || url.pathname === '/') h.set('cache-control', 'public, max-age=300');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  },
};
