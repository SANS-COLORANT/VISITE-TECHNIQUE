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

  if (
    Number(frame?.v) !== 1 ||
    !clean(frame?.b) ||
    !Number(frame?.i) ||
    !Number(frame?.n) ||
    !Array.isArray(frame?.c) ||
    !Array.isArray(frame?.s) ||
    (frame?.d != null && !Array.isArray(frame.d))
  ) {
    throw new Error('QR client MÉTRA incomplet.');
  }
  return frame;
}

function isOfflineClientQr(raw) {
  return clean(raw).startsWith(OFFLINE_CLIENT_PREFIX);
}

function framePayloadLength({
  batchId,
  clientTuple,
  sites = [],
  details = [],
  detailedVisitCount = 0,
  index = 999,
  total = 999,
  generatedAt = '',
}) {
  return encodeOfflineClientQrFrame({
    v: 1,
    b: batchId,
    i: index,
    n: total,
    c: clientTuple,
    s: sites,
    d: details,
    q: Number(detailedVisitCount || 0),
    g: generatedAt,
  }).length;
}

function splitLargeSite(siteTuple, context) {
  const [id, name, address, locals = [], visits = []] = siteTuple;
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
    return [id, clean(name).slice(0, 140), clean(address).slice(0, 180), [], []];
  });
}

function splitVisitDetail(visitId, visitSnapshot, context) {
  const text = JSON.stringify(visitSnapshot || {});
  if (!text || text === '{}') return [];

  let chunkSize = Math.max(220, Math.min(1050, context.maxChars - 560));
  while (
    chunkSize > 220 &&
    framePayloadLength({
      ...context,
      sites: [],
      details: [[clean(visitId), 9999, 9999, text.slice(0, chunkSize)]],
    }) > context.maxChars
  ) {
    chunkSize -= 80;
  }

  if (
    framePayloadLength({
      ...context,
      sites: [],
      details: [[clean(visitId), 1, 1, text.slice(0, chunkSize)]],
    }) > context.maxChars
  ) {
    throw new Error(`Visite ${visitId} trop volumineuse pour le format QR hors connexion.`);
  }

  const total = Math.max(1, Math.ceil(text.length / chunkSize));
  const parts = [];
  for (let offset = 0; offset < total; offset += 1) {
    const chunk = text.slice(offset * chunkSize, (offset + 1) * chunkSize);
    parts.push([clean(visitId), offset + 1, total, chunk]);
  }
  return parts;
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
  const detailSnapshots = snapshot.offlineVisitSnapshots || {};
  const detailedVisitIds = Object.keys(detailSnapshots).filter((visitId) => detailSnapshots[visitId]);
  const detailedVisitCount = detailedVisitIds.length;
  const context = {
    batchId,
    clientTuple,
    generatedAt,
    detailedVisitCount,
    maxChars: Math.max(900, Number(maxFrameChars || DEFAULT_MAX_FRAME_CHARS)),
  };

  const pieces = [];
  const seenDetails = new Set();
  const siteTuples = (snapshot.sites || []).map(compactSite);
  const detailLabelByVisit = new Map();

  for (let siteIndex = 0; siteIndex < siteTuples.length; siteIndex += 1) {
    const siteTuple = siteTuples[siteIndex];
    const site = (snapshot.sites || [])[siteIndex] || {};
    const siteFragments = framePayloadLength({ ...context, sites: [siteTuple] }) <= context.maxChars
      ? [siteTuple]
      : splitLargeSite(siteTuple, context);

    for (const fragment of siteFragments) pieces.push({ sites: [fragment], details: [] });

    for (const visit of site.visits || []) {
      const visitId = clean(visit.id);
      const detail = detailSnapshots[visitId];
      if (!visitId || !detail || seenDetails.has(visitId)) continue;
      seenDetails.add(visitId);
      detailLabelByVisit.set(
        visitId,
        [clean(site.name) || 'Site', clean(visit.local), clean(visit.date)].filter(Boolean).join(' · ')
      );
      for (const part of splitVisitDetail(visitId, detail, context)) pieces.push({ sites: [], details: [part] });
    }
  }

  for (const visitId of detailedVisitIds) {
    if (seenDetails.has(visitId)) continue;
    const detail = detailSnapshots[visitId];
    seenDetails.add(visitId);
    detailLabelByVisit.set(
      visitId,
      [clean(detail?.visit?.site) || 'Visite', clean(detail?.visit?.date)].filter(Boolean).join(' · ')
    );
    for (const part of splitVisitDetail(visitId, detail, context)) pieces.push({ sites: [], details: [part] });
  }

  const groups = [];
  let current = { sites: [], details: [] };
  const flush = () => {
    if (current.sites.length || current.details.length || groups.length === 0) groups.push(current);
    current = { sites: [], details: [] };
  };

  for (const piece of pieces) {
    const candidate = {
      sites: [...current.sites, ...(piece.sites || [])],
      details: [...current.details, ...(piece.details || [])],
    };
    if (
      (current.sites.length || current.details.length) &&
      framePayloadLength({ ...context, sites: candidate.sites, details: candidate.details }) > context.maxChars
    ) {
      flush();
      current = { sites: [...(piece.sites || [])], details: [...(piece.details || [])] };
    } else {
      current = candidate;
    }
  }
  if (current.sites.length || current.details.length || groups.length === 0) flush();

  const total = groups.length;
  const frames = groups.map((group, offset) => {
    const index = offset + 1;
    const frame = {
      v: 1,
      b: batchId,
      i: index,
      n: total,
      c: clientTuple,
      s: group.sites,
      d: group.details,
      q: detailedVisitCount,
      g: generatedAt,
    };
    const uniqueSites = [];
    const seenSites = new Set();
    for (const row of group.sites) {
      const id = clean(row?.[0]);
      if (!id || seenSites.has(id)) continue;
      seenSites.add(id);
      uniqueSites.push({ id, name: clean(row?.[1]) || 'Site' });
    }
    const visitIds = [...new Set((group.details || []).map((row) => clean(row?.[0])).filter(Boolean))];
    const detailLabels = visitIds.map((visitId) => detailLabelByVisit.get(visitId) || `Visite ${visitId}`);
    const first = uniqueSites[0]?.name || detailLabels[0] || 'Client';
    const last = uniqueSites[uniqueSites.length - 1]?.name || detailLabels[detailLabels.length - 1] || first;
    const description = uniqueSites.length > 1
      ? `${first} → ${last} · ${uniqueSites.length} sites`
      : uniqueSites.length === 1
        ? first
        : detailLabels.length > 1
          ? `Détails · ${detailLabels.length} visites`
          : detailLabels[0] || 'Données visite hors connexion';
    const payload = encodeOfflineClientQrFrame(frame);
    return {
      index,
      total,
      payload,
      siteIds: uniqueSites.map((site) => site.id),
      siteNames: uniqueSites.map((site) => site.name),
      visitIds,
      detailLabels,
      title: `QR ${index}/${total}`,
      description,
      chars: payload.length,
    };
  });

  const uniqueSiteIds = new Set(siteTuples.map((site) => clean(site[0])).filter(Boolean));
  return {
    version: 2,
    batchId,
    type: 'offlineClientQrBatch',
    clientId: clean(snapshot.client.id),
    clientName: clean(snapshot.client.name) || 'Client',
    clientCode: clean(snapshot.client.code),
    createdAt: generatedAt,
    totalSites: uniqueSiteIds.size,
    totalDetailedVisits: detailedVisitCount,
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
  const totalDetailedVisits = Math.max(0, ...parsed.map((frame) => Number(frame.q || 0)));

  for (const frame of parsed) {
    if (clean(frame.b) !== batchId) throw new Error('Les QR scannés n’appartiennent pas au même lot.');
    if (clean(frame?.c?.[0]) !== clean(clientTuple[0])) throw new Error('Les QR scannés appartiennent à des clients différents.');
  }

  const siteMap = new Map();
  const detailPartsByVisit = new Map();

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

    for (const part of frame.d || []) {
      const visitId = clean(part?.[0]);
      const index = Number(part?.[1] || 0);
      const total = Number(part?.[2] || 0);
      const chunk = String(part?.[3] == null ? '' : part[3]);
      if (!visitId || index <= 0 || total <= 0 || index > total) continue;
      const entry = detailPartsByVisit.get(visitId) || { total, parts: new Map() };
      entry.total = Math.max(entry.total || 0, total);
      entry.parts.set(index, chunk);
      detailPartsByVisit.set(visitId, entry);
    }
  }

  const detailSnapshotByVisit = new Map();
  for (const [visitId, entry] of detailPartsByVisit.entries()) {
    if (!entry?.total || entry.parts.size < entry.total) continue;
    const chunks = [];
    let complete = true;
    for (let index = 1; index <= entry.total; index += 1) {
      if (!entry.parts.has(index)) {
        complete = false;
        break;
      }
      chunks.push(entry.parts.get(index));
    }
    if (!complete) continue;
    try {
      const detail = JSON.parse(chunks.join(''));
      if (detail?.type === 'visitSnapshot') detailSnapshotByVisit.set(visitId, detail);
    } catch {
      // Le lot reste utilisable pour les sites déjà reçus si une trame détail
      // est incomplète ou corrompue.
    }
  }

  for (const [siteId, site] of siteMap.entries()) {
    const visits = (site.visits || []).map((visit) => {
      const offlineSnapshot = detailSnapshotByVisit.get(String(visit.id)) || null;
      return {
        ...visit,
        offlineReady: Boolean(offlineSnapshot),
        offlineSnapshot,
      };
    });
    siteMap.set(siteId, {
      ...site,
      visits,
      visitCount: visits.length,
      activeVisitCount: visits.filter((visit) => visit.status === 'en_cours').length,
    });
  }

  const sites = [...siteMap.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }));
  const scannedFrames = [...new Set(parsed.map((frame) => Number(frame.i)).filter(Boolean))].sort((a, b) => a - b);
  const readyVisits = detailSnapshotByVisit.size;

  return {
    version: 3,
    type: 'clientSnapshot',
    scope: 'client',
    offlineQr: true,
    offlineBatchId: batchId,
    offlineProgress: {
      scannedFrames,
      scanned: scannedFrames.length,
      total: totalFrames,
      complete: totalFrames > 0 && scannedFrames.length >= totalFrames,
      readyVisits,
      detailedVisits: totalDetailedVisits,
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
      offlineReadyVisits: readyVisits,
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
