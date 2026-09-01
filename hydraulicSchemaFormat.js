export const METRA_HYDRAULIC_FORMAT = 'metra-hydraulic-schema';
export const METRA_HYDRAULIC_VERSION = 1;

const asText = (value) => String(value ?? '').trim();
const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} doit être un objet JSON.`);
  return value;
}

function normalizeEndpoint(endpoint, nodeId, portId) {
  if (endpoint && typeof endpoint === 'object') {
    return {
      equipmentId: asText(endpoint.equipmentId || endpoint.nodeId || endpoint.id),
      portId: asText(endpoint.portId || endpoint.port || endpoint.connector),
    };
  }
  return { equipmentId: asText(nodeId), portId: asText(portId) };
}

function normalizeEquipment(raw, index) {
  const id = asText(raw?.id) || `eq_import_${index + 1}`;
  const type = asText(raw?.type || raw?.equipmentType || raw?.kind);
  if (!type) throw new Error(`Équipement ${index + 1} : type manquant.`);
  return {
    ...raw,
    id,
    type,
    label: asText(raw?.label || raw?.name || raw?.nom) || type,
    x: asNumber(raw?.x, 40 + (index % 6) * 150),
    y: asNumber(raw?.y, 50 + Math.floor(index / 6) * 150),
    rotation: asNumber(raw?.rotation, 0),
    running: raw?.running !== false,
    secondaryRunning: raw?.secondaryRunning !== false,
    status: asText(raw?.status) || 'ok',
    valvePosition: asNumber(raw?.valvePosition, 50),
    equipmentId: raw?.equipmentId ?? raw?.metraEquipmentId ?? null,
    networkId: raw?.networkId ?? null,
    metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
  };
}

function normalizeConnection(raw, index) {
  const from = normalizeEndpoint(raw?.from, raw?.fromNodeId, raw?.fromPort);
  const to = normalizeEndpoint(raw?.to, raw?.toNodeId, raw?.toPort);
  if (!from.equipmentId || !to.equipmentId) throw new Error(`Liaison ${index + 1} : équipement de départ ou d'arrivée manquant.`);
  if (!from.portId || !to.portId) throw new Error(`Liaison ${index + 1} : borne de départ ou d'arrivée manquante.`);
  const mediumRaw = asText(raw?.medium || raw?.flowType || raw?.fluidType).toLowerCase();
  const medium = mediumRaw === 'cold' || mediumRaw === 'retour' || mediumRaw === 'return' ? 'cold'
    : mediumRaw === 'air' || mediumRaw === 'vmc' ? 'air'
      : 'hot';
  return {
    ...raw,
    id: asText(raw?.id) || `co_import_${index + 1}`,
    from,
    to,
    medium,
    direction: Number(raw?.direction) === -1 ? -1 : 1,
    networkId: raw?.networkId ?? null,
    metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
  };
}

export function normalizeHydraulicSchema(input) {
  const root = ensureObject(input, 'Le fichier METRA');
  const payload = root.schema && typeof root.schema === 'object' ? root.schema : root;
  const rawEquipment = Array.isArray(payload.equipment) ? payload.equipment : Array.isArray(payload.nodes) ? payload.nodes : null;
  const rawConnections = Array.isArray(payload.connections) ? payload.connections : Array.isArray(payload.edges) ? payload.edges : null;
  if (!rawEquipment) throw new Error('Le fichier ne contient pas de liste « equipment » ou « nodes ».');
  if (!rawConnections) throw new Error('Le fichier ne contient pas de liste « connections » ou « edges ».');

  const equipment = rawEquipment.map(normalizeEquipment);
  const idSet = new Set();
  equipment.forEach((item) => {
    if (idSet.has(item.id)) throw new Error(`Identifiant équipement dupliqué : ${item.id}.`);
    idSet.add(item.id);
  });

  const connections = rawConnections.map(normalizeConnection);
  connections.forEach((connection, index) => {
    if (!idSet.has(connection.from.equipmentId) || !idSet.has(connection.to.equipmentId)) {
      throw new Error(`Liaison ${index + 1} : elle référence un équipement absent du fichier.`);
    }
  });

  return {
    version: METRA_HYDRAULIC_VERSION,
    equipment,
    connections,
    networks: Array.isArray(payload.networks) ? payload.networks : [],
    annotations: Array.isArray(payload.annotations) ? payload.annotations : [],
    source: payload.source && typeof payload.source === 'object' ? payload.source : root.source && typeof root.source === 'object' ? root.source : null,
  };
}

function uniqueId(base, used) {
  if (!used.has(base)) { used.add(base); return base; }
  let i = 2;
  while (used.has(`${base}_${i}`)) i += 1;
  const next = `${base}_${i}`;
  used.add(next);
  return next;
}

export function mergeHydraulicSchemas(currentInput, incomingInput) {
  const current = normalizeHydraulicSchema(currentInput);
  const incoming = normalizeHydraulicSchema(incomingInput);
  const usedEquipment = new Set(current.equipment.map((item) => item.id));
  const usedConnections = new Set(current.connections.map((item) => item.id));
  const idMap = new Map();

  const importedEquipment = incoming.equipment.map((item) => {
    const id = uniqueId(item.id, usedEquipment);
    idMap.set(item.id, id);
    return { ...item, id, x: item.x + 32, y: item.y + 32 };
  });
  const importedConnections = incoming.connections.map((connection) => ({
    ...connection,
    id: uniqueId(connection.id, usedConnections),
    from: { ...connection.from, equipmentId: idMap.get(connection.from.equipmentId) || connection.from.equipmentId },
    to: { ...connection.to, equipmentId: idMap.get(connection.to.equipmentId) || connection.to.equipmentId },
  }));

  const networksById = new Map();
  [...(current.networks || []), ...(incoming.networks || [])].forEach((network, index) => {
    const key = asText(network?.id) || `network_${index + 1}`;
    if (!networksById.has(key)) networksById.set(key, network);
  });

  return {
    version: METRA_HYDRAULIC_VERSION,
    equipment: [...current.equipment, ...importedEquipment],
    connections: [...current.connections, ...importedConnections],
    networks: [...networksById.values()],
    annotations: [...(current.annotations || []), ...(incoming.annotations || [])],
    source: incoming.source || current.source || null,
  };
}

export function buildHydraulicExchange(schemaInput, metadata = {}) {
  const schema = normalizeHydraulicSchema(schemaInput);
  return {
    format: METRA_HYDRAULIC_FORMAT,
    version: METRA_HYDRAULIC_VERSION,
    exportedAt: new Date().toISOString(),
    metadata,
    schema,
  };
}

export function summarizeHydraulicSchema(schemaInput) {
  const schema = normalizeHydraulicSchema(schemaInput);
  return {
    equipment: schema.equipment.length,
    connections: schema.connections.length,
    networks: schema.networks.length,
    annotations: schema.annotations.length,
  };
}
