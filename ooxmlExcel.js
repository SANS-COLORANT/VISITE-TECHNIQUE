import JSZip from 'jszip';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`));
  return match ? match[1] : null;
}

function setAttr(tag, name, value) {
  const re = new RegExp(`\\s${name.replace(':', '\\:')}="[^"]*"`);
  if (re.test(tag)) return tag.replace(re, ` ${name}="${escapeXml(value)}"`);
  return tag.replace(/\/?\s*>$/, (end) => ` ${name}="${escapeXml(value)}"${end}`);
}

function removeAttr(tag, name) {
  return tag.replace(new RegExp(`\\s${name.replace(':', '\\:')}="[^"]*"`), '');
}

function parseRelationships(xml) {
  const rels = {};
  const tags = xml.match(/<Relationship\b[^>]*\/?\s*>/g) || [];
  tags.forEach((tag) => {
    const id = getAttr(tag, 'Id');
    const target = getAttr(tag, 'Target');
    if (id && target) rels[id] = target;
  });
  return rels;
}

function normalizeWorkbookTarget(target) {
  if (target.startsWith('/')) return target.replace(/^\//, '');
  return `xl/${target.replace(/^\.\//, '')}`;
}

function parseSheetPaths(workbookXml, relsXml) {
  const rels = parseRelationships(relsXml);
  const result = {};
  const tags = workbookXml.match(/<sheet\b[^>]*\/?\s*>/g) || [];
  tags.forEach((tag) => {
    const name = decodeXml(getAttr(tag, 'name') || '');
    const relId = getAttr(tag, 'r:id');
    if (name && relId && rels[relId]) result[name] = normalizeWorkbookTarget(rels[relId]);
  });
  return result;
}

function excelSerialFromIsoDate(value, date1904) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (!match) return null;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const serial1900 = utc / 86400000 + 25569;
  return date1904 ? serial1900 - 1462 : serial1900;
}

function cleanCellInner(inner) {
  return String(inner || '')
    .replace(/<f\b[^>]*>[\s\S]*?<\/f>/g, '')
    .replace(/<f\b[^>]*\/>/g, '')
    .replace(/<v\b[^>]*>[\s\S]*?<\/v>/g, '')
    .replace(/<is\b[^>]*>[\s\S]*?<\/is>/g, '');
}

function appendCellPayload(inner, payload) {
  const cleaned = cleanCellInner(inner);
  const extIndex = cleaned.search(/<extLst\b/);
  if (extIndex >= 0) return `${cleaned.slice(0, extIndex)}${payload}${cleaned.slice(extIndex)}`;
  return `${cleaned}${payload}`;
}

function boolValue(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'oui', 'yes', 'x'].includes(normalized) ? 1 : 0;
}

function numericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function updateSharedStringsXml(xml, value) {
  if (!xml) return { xml: null, index: null };
  const items = xml.match(/<si\b[\s\S]*?<\/si>/g) || [];
  const index = items.length;
  const text = String(value);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  const si = `<si><t${preserve}>${escapeXml(text)}</t></si>`;
  let updated = xml.replace(/<\/sst>\s*$/, `${si}</sst>`);
  const uniqueMatch = updated.match(/\buniqueCount="(\d+)"/);
  if (uniqueMatch) updated = updated.replace(/\buniqueCount="\d+"/, `uniqueCount="${Number(uniqueMatch[1]) + 1}"`);
  return { xml: updated, index };
}

function buildPayload(type, value, context) {
  if (type === 'b') return { type: 'b', payload: `<v>${boolValue(value)}</v>` };
  if (type === 'd') return { type: 'd', payload: `<v>${escapeXml(value)}</v>` };
  if (type === 'str') return { type: 'str', payload: `<v>${escapeXml(value)}</v>` };

  if (type === 'n' || type === null) {
    const dateSerial = context.hadNumericValue ? excelSerialFromIsoDate(value, context.date1904) : null;
    const number = dateSerial ?? numericValue(value);
    if (number !== null && (typeof value === 'number' || context.hadNumericValue)) {
      return { type: type === 'n' ? 'n' : null, payload: `<v>${number}</v>` };
    }
  }

  if (type === 'inlineStr') {
    const text = String(value);
    const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
    return { type: 'inlineStr', payload: `<is><t${preserve}>${escapeXml(text)}</t></is>` };
  }

  if (type === 's' && context.addSharedString) {
    const index = context.addSharedString(value);
    return { type: 's', payload: `<v>${index}</v>` };
  }

  const text = String(value);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return { type: 'inlineStr', payload: `<is><t${preserve}>${escapeXml(text)}</t></is>` };
}

function replaceCell(xml, ref, value, context) {
  const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<c\\b[^>]*\\br="${escapedRef}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const match = xml.match(re);

  if (match) {
    const original = match[0];
    const openMatch = original.match(/^<c\b[^>]*>/) || original.match(/^<c\b[^>]*\/>/);
    let open = openMatch ? openMatch[0] : `<c r="${ref}">`;
    const selfClosing = /\/>$/.test(open);
    const inner = selfClosing ? '' : original.slice(open.length, -4);
    const currentType = getAttr(open, 't');
    const hadNumericValue = !currentType && /<v\b[^>]*>[-+]?\d/.test(inner);
    const built = buildPayload(currentType, value, { ...context, hadNumericValue });

    if (built.type) open = setAttr(open, 't', built.type);
    else open = removeAttr(open, 't');
    open = open.replace(/\/>$/, '>');
    const replacement = `${open}${appendCellPayload(inner, built.payload)}</c>`;
    return xml.replace(re, replacement);
  }

  const rowNumber = Number((ref.match(/\d+$/) || [])[0]);
  if (!rowNumber) return xml;
  const built = buildPayload(null, value, { ...context, hadNumericValue: false });
  const typeAttr = built.type ? ` t="${built.type}"` : '';
  const cellXml = `<c r="${ref}"${typeAttr}>${built.payload}</c>`;
  const rowRe = new RegExp(`(<row\\b[^>]*\\br="${rowNumber}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  if (rowRe.test(xml)) return xml.replace(rowRe, (_, start, body, end) => `${start}${body}${cellXml}${end}`);
  return xml.replace(/<\/sheetData>/, `<row r="${rowNumber}">${cellXml}</row></sheetData>`);
}

export async function patchWorkbookBase64(sourceBase64, updates) {
  const zip = await JSZip.loadAsync(sourceBase64, { base64: true });
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetPaths = parseSheetPaths(workbookXml, relsXml);
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbookXml);

  const sharedFile = zip.file('xl/sharedStrings.xml');
  let sharedStringsXml = sharedFile ? await sharedFile.async('string') : null;
  let sharedStringsDirty = false;
  const addSharedString = sharedStringsXml ? (value) => {
    const result = updateSharedStringsXml(sharedStringsXml, value);
    sharedStringsXml = result.xml;
    sharedStringsDirty = true;
    return result.index;
  } : null;

  const grouped = new Map();
  updates.forEach((update) => {
    if (update.value === null || update.value === undefined || update.value === '') return;
    if (!grouped.has(update.sheet)) grouped.set(update.sheet, []);
    grouped.get(update.sheet).push(update);
  });

  for (const [sheetName, sheetUpdates] of grouped.entries()) {
    const path = sheetPaths[sheetName];
    if (!path || !zip.file(path)) continue;
    let xml = await zip.file(path).async('string');
    sheetUpdates.forEach((update) => {
      xml = replaceCell(xml, update.ref, update.value, { date1904, addSharedString });
    });
    zip.file(path, xml);
  }

  if (sharedStringsDirty && sharedStringsXml) zip.file('xl/sharedStrings.xml', sharedStringsXml);
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}
