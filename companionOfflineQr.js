const OFFLINE_CLIENT_PREFIX = 'METRA-OFFLINE-CLIENT-1:';
const DEFAULT_MAX_FRAME_CHARS = 1750;

const clean = (value) => String(value == null ? '' : value).trim();

function makeId(prefix = 'qr') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function compactLocal(local = {}) {
  return [clean(local.id), clean(local.name), clean(local.type)];
}

function compactVisit(visit = {}) {
  return [
    clean(visit.id),
    clean(visit.installationId),
    clean(visit.date),
    clean(visit.status),
    clean(visit.template),
    Number(visit.progress || 0),
    clean(visit.local),
  ];
}

function compactSite(site = {}) {
  return [
    clean(site.id),
    clean(site.name),
    clean(site.address),
    (site.locals || []).map(compactLocal),
    (site.visits || []).map(compactVisit),
  ];
}

function expandLocal(row = []) {
  return { id: clean(row[0]), name: clean(row[1]) || 'Local technique', type: clean(row[2]) };
}

function expandVisit(row = []) {
  return {
    id: clean(row[0]),
    installationId: clean(row[1]) || null,
    date: clean(row[2]),
    status: clean(row[3]),
    template: clean(row[4]) || 'icpe_v1',
    progress: Number(row[5] || 0),
    local: clean(row[6]) || 'Visite site',
  };
}

function expandSite(row = []) {
  const locals = Array.isArray(row[3]) ? row[3].map(expandLocal) : [];
  const visits = Array.isArray(row[4]) ? row[4].map(expandVisit) : [];
  return {
    id: clean(row[0]),
    name: clean(row[1]) || 'Site',
    address: clean(row[2]),
    locals,
    visits,
    visitCount: visits.length,
    activeVisitCount: visits.filter((visit) => visit.status === 'en_cours').length,
  };
}

function encodeOfflineClientQrFrame(frame) {
  return OFFLINE_CLIENT_PREFIX + JSON.stringify(frame);
}

function decodeOfflineClientQrFrame(raw) {
  const text = clean(raw);
  if (!text.startsWith(OFFLINE_CLIENT_PREFIX)) throw new Error('Ce QR code n’est pas un lot client MÉTRA hors connexion.');
  let frame = null;
  try { frame = JSON.parse(text.slice(OFFLINE_CLIENT_PREFIX.length)); }
  catch { throw new Error('QR client MÉTRA illisible.'); }

  if (Number(frame?.v) !== 1 || !clean(frame?.b) || !Number(frame?.i) || !Number(frame?.n) || !Array.isArray(frame?.c) || !Array.isArray(frame?.s)) {
    throw new Error('QR client MÉTRA incomplet.');
  }
  return frame;
}

function isOfflineClientQr(raw) {
  return clean(raw).startsWith(OFFLINE_CLIENT_PREFIX);
}

function framePayloadLength({ batchId, clientTuple, sites, index = 999, total = 999, generatedAt = '' }) {
  return encodeOfflineClientQrFrame({
    v: 1,
    b: batchId,
    i: index,
    n: total,
    c: clientTuple,
    s: sites,
    g: generatedAt,
  }).length;
}

function splitLargeSite(siteTuple, context) {
  const [id, name, address, locals = [], visits = []] = siteTuple;
  const base = [id, name, address, [], []];
  const fragments = [];
  let current = [id, name, address, [], []];

  const flush = () => {
    const hasDetails = current[3].length || current[4].length;
    if (hasDetails || fragments.length === 0) fragments.push(current);
    current = [id, name, address, [], []];
  };

  for (const local of locals) {
    const candidate = [id, name, address, [...current[3], local], [...current[4]]];
    if (framePayloadLength({ ...context, sites: [candidate] }) > context.maxChars && (current[3].length || current[4].length)) flush();
    current[3].push(local);
  }

  for (const visit of visits) {
    const candidate = [id, name, address, [...current[3]], [...current[4], visit]];
    if (framePayloadLength({ ...context, sites: [candidate] }) > context.maxChars && (current[3].length || current[4].length)) flush();
    current[4].push(visit);
  }

  if (current[3].length || current[4].length || !fragments.length) flush();

  return fragments.map((fragment) => {
    if (framePayloadLength({ ...context, sites: [fragment] }) <= context.maxChars) return fragment;
    // Un libellé/adresse exceptionnellement long ne doit jamais bloquer le lot.
    return [id, clean(name).slice(0, 140), clean(address).slice(0, 180), [], []];
  });
}

function buildOfflineClientQrBatch(snapshot, { maxFrameChars = DEFAULT_MAX_FRAME_CHARS } = {}) {
  if (!snapshot?.client?.id || snapshot?.type !== 'clientSnapshot') throw new Error('Client à exporter invalide.');
  const batchId = makeId('client');
  const generatedAt = new Date().toISOString();
  const clientTuple = [
    clean(snapshot.client.id),
    clean(snapshot.client.name),
    clean(snapshot.client.code),
    clean(snapshot.client.address),
  ];

  const siteTuples = (snapshot.sites || []).map(compactSite);
  const fragments = [];
  const context = { batchId, clientTuple, generatedAt, maxChars: Math.max(900, Number(maxFrameChars || DEFAULT_MAX_FRAME_CHARS)) };

  for (const site of siteTuples) {
    if (framePayloadLength({ ...context, sites: [site] }) <= context.maxChars) fragments.push(site);
    else fragments.push(...splitLargeSite(site, context));
  }

  const groups = [];
  let current = [];
  for (const fragment of fragments) {
    const candidate = [...current, fragment];
    if (current.length && framePayloadLength({ ...context, sites: candidate }) > context.maxChars) {
      groups.push(current);
      current = [fragment];
    } else {
      current = candidate;
    }
  }
  if (current.length || groups.length === 0) groups.push(current);

  const total = groups.length;
  const frames = groups.map((sites, offset) => {
    const index = offset + 1;
    const frame = { v: 1, b: batchId, i: index, n: total, c: clientTuple, s: sites, g: generatedAt };
    const uniqueSites = [];
    const seen = new Set();
    for (const row of sites) {
      const id = clean(row?.[0]);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      uniqueSites.push({ id, name: clean(row?.[1]) || 'Site' });
    }
    const first = uniqueSites[0]?.name || 'Client';
    const last = uniqueSites[uniqueSites.length - 1]?.name || first;
    const description = uniqueSites.length <= 1
      ? first
      : `${first} → ${last} · ${uniqueSites.length} sites`;
    return {
      index,
      total,
      payload: encodeOfflineClientQrFrame(frame),
      siteIds: uniqueSites.map((site) => site.id),
      siteNames: uniqueSites.map((site) => site.name),
      title: `QR ${index}/${total}`,
      description,
      chars: encodeOfflineClientQrFrame(frame).length,
    };
  });

  const uniqueSiteIds = new Set(siteTuples.map((site) => clean(site[0])).filter(Boolean));
  return {
    version: 1,
    batchId,
    type: 'offlineClientQrBatch',
    clientId: clean(snapshot.client.id),
    clientName: clean(snapshot.client.name) || 'Client',
    clientCode: clean(snapshot.client.code),
    createdAt: generatedAt,
    totalSites: uniqueSiteIds.size,
    totalFrames: frames.length,
    frames,
  };
}

function mergeOfflineClientQrFrames(frames = []) {
  if (!frames.length) return null;
  const parsed = frames.map((frame) => typeof frame === 'string' ? decodeOfflineClientQrFrame(frame) : frame);
  const first = parsed[0];
  const batchId = clean(first.b);
  const clientTuple = first.c || [];
  const totalFrames = Number(first.n || 0);

  for (const frame of parsed) {
    if (clean(frame.b) !== batchId) throw new Error('Les QR scannés n’appartiennent pas au même lot.');
    if (clean(frame?.c?.[0]) !== clean(clientTuple[0])) throw new Error('Les QR scannés appartiennent à des clients différents.');
  }

  const siteMap = new Map();
  for (const frame of parsed.sort((a, b) => Number(a.i) - Number(b.i))) {
    for (const row of frame.s || []) {
      const site = expandSite(row);
      if (!site.id) continue;
      const previous = siteMap.get(site.id) || { ...site, locals: [], visits: [] };
      const localMap = new Map((previous.locals || []).map((item) => [String(item.id), item]));
      for (const local of site.locals || []) if (local.id) localMap.set(String(local.id), local);
      const visitMap = new Map((previous.visits || []).map((item) => [String(item.id), item]));
      for (const visit of site.visits || []) if (visit.id) visitMap.set(String(visit.id), visit);
      const locals = [...localMap.values()];
      const visits = [...visitMap.values()];
      siteMap.set(site.id, {
        ...previous,
        name: site.name || previous.name,
        address: site.address || previous.address,
        locals,
        visits,
        visitCount: visits.length,
        activeVisitCount: visits.filter((visit) => visit.status === 'en_cours').length,
      });
    }
  }

  const sites = [...siteMap.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }));
  const scannedFrames = [...new Set(parsed.map((frame) => Number(frame.i)).filter(Boolean))].sort((a, b) => a - b);

  return {
    version: 2,
    type: 'clientSnapshot',
    scope: 'client',
    offlineQr: true,
    offlineBatchId: batchId,
    offlineProgress: {
      scannedFrames,
      scanned: scannedFrames.length,
      total: totalFrames,
      complete: totalFrames > 0 && scannedFrames.length >= totalFrames,
    },
    client: {
      id: clean(clientTuple[0]),
      name: clean(clientTuple[1]) || 'Client',
      code: clean(clientTuple[2]),
      address: clean(clientTuple[3]),
    },
    sites,
    counts: {
      sites: sites.length,
      locals: sites.reduce((sum, site) => sum + (site.locals || []).length, 0),
      visits: sites.reduce((sum, site) => sum + (site.visits || []).length, 0),
      activeVisits: sites.reduce((sum, site) => sum + Number(site.activeVisitCount || 0), 0),
    },
    generatedAt: clean(first.g) || new Date().toISOString(),
  };
}

export {
  DEFAULT_MAX_FRAME_CHARS,
  OFFLINE_CLIENT_PREFIX,
  buildOfflineClientQrBatch,
  decodeOfflineClientQrFrame,
  encodeOfflineClientQrFrame,
  isOfflineClientQr,
  mergeOfflineClientQrFrames,
};
