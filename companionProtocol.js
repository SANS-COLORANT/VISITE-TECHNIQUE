function buildCompanionQrPayload({ host, port, sessionId, token, scope = 'visit', scopeId = null, label = null }) {
  const qs = [
    ['host', host],
    ['port', String(port || '')],
    ['session', sessionId],
    ['token', token],
    ['scope', scope || 'visit'],
    ['scopeId', scopeId || ''],
    ['label', label || ''],
    ['v', '2']
  ]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v || ''))}`)
    .join('&');
  return `metra://companion?${qs}`;
}

function parseCompanionQrPayload(raw) {
  const text = String(raw || '').trim();
  if (!text.startsWith('metra://companion?'))
    throw new Error('Ce QR code ne correspond pas à une session MÉTRA Compagnon.');
  const query = text.slice(text.indexOf('?') + 1);
  const params = {};
  query.split('&').forEach((chunk) => {
    const [k, ...rest] = chunk.split('=');
    if (!k) return;
    params[decodeURIComponent(k)] = decodeURIComponent(rest.join('=') || '');
  });
  const port = Number(params.port || 0);
  if (!params.host || !port || !params.session || !params.token) throw new Error('QR code MÉTRA incomplet.');
  return {
    host: params.host,
    port,
    sessionId: params.session,
    token: params.token,
    version: Number(params.v || 1),
    scope: params.scope || 'visit',
    scopeId: params.scopeId || null,
    label: params.label || null
  };
}

export { buildCompanionQrPayload, parseCompanionQrPayload };
