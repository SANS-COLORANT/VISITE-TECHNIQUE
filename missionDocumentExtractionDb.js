import * as FileSystem from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { rendrePagePdfLocale, reconnaitreTexteImageLocale } from './missionNativeTools.js';

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function nativePath(uri) {
  return String(uri || '').replace(/^file:\/\//, '');
}

function decodeXml(text) {
  return String(text || '')
    .replace(/<w:tab\/?\s*>/g, '\t')
    .replace(/<w:br\/?\s*>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function classifyLines(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const items = [];
  for (const line of lines) {
    let itemType = 'information';
    if (
      /(action|préconis|preconis|à réaliser|a realiser|travaux|corriger|remplacer|reprendre|mettre en place)/i.test(
        line
      )
    )
      itemType = 'action';
    else if (/(réserve|reserve|non conforme|écart|ecart|défaut|defaut|anomalie)/i.test(line)) itemType = 'finding';
    else if (/(mesur|température|temperature|débit|debit|pression|puissance|kwh|kw\b|°c|m3\/h|m³\/h)/i.test(line))
      itemType = 'measure';
    else if (
      /(chaudière|chaudiere|pompe|ballon|échangeur|echangeur|brûleur|bruleur|automate|régulateur|regulateur|unité extérieure|unite exterieure|unité intérieure|unite interieure)/i.test(
        line
      )
    )
      itemType = 'equipment';
    else if (/(document|doe|plan|schéma|schema|pv|notice|cctp|dpgf)/i.test(line)) itemType = 'document';

    if (itemType !== 'information' || line.length >= 25) {
      items.push({ itemType, label: line.slice(0, 120), valueText: line });
    }
    if (items.length >= 500) break;
  }
  return items;
}

async function extractDocx(uri) {
  const root = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + 'metra-docx-extract-' + Date.now() + '/';
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  try {
    await unzip(nativePath(uri), nativePath(root));
    const xmlPath = root + 'word/document.xml';
    const info = await FileSystem.getInfoAsync(xmlPath);
    if (!info.exists) throw new Error('document.xml absent du DOCX.');
    const xml = await FileSystem.readAsStringAsync(xmlPath, { encoding: FileSystem.EncodingType.UTF8 });
    return [{ sourcePart: 'word/document.xml', pageNumber: null, text: decodeXml(xml), engine: 'docx_xml' }];
  } finally {
    await FileSystem.deleteAsync(root, { idempotent: true }).catch(() => {});
  }
}

async function extractTextFile(uri) {
  const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  return [{ sourcePart: 'file', pageNumber: null, text, engine: 'text' }];
}

async function extractImage(uri) {
  const started = Date.now();
  const result = await reconnaitreTexteImageLocale(uri);
  if (result?.unavailable) throw new Error("L'OCR local n'est pas disponible sur cet appareil.");
  return [
    {
      sourcePart: 'image',
      pageNumber: 1,
      text: result?.text || '',
      engine: 'android_mlkit',
      durationMs: result?.durationMs || Date.now() - started
    }
  ];
}

async function extractPdf(uri) {
  const outputs = [];
  const first = await rendrePagePdfLocale(uri, 0, 1500);
  const count = Number(first?.pageCount || 1);
  for (let pageIndex = 0; pageIndex < count; pageIndex += 1) {
    const started = Date.now();
    const rendered = pageIndex === 0 ? first : await rendrePagePdfLocale(uri, pageIndex, 1500);
    const ocr = await reconnaitreTexteImageLocale(rendered.uri);
    outputs.push({
      sourcePart: 'page:' + (pageIndex + 1),
      pageNumber: pageIndex + 1,
      text: ocr?.text || '',
      engine: 'pdf_renderer+android_mlkit',
      durationMs: Number(ocr?.durationMs || Date.now() - started)
    });
  }
  return outputs;
}

function documentKind(doc) {
  const name = String(doc?.name || '').toLowerCase();
  const type = String(doc?.type || '').toLowerCase();
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.pdf') || type.includes('pdf')) return 'pdf';
  if (/\.(png|jpe?g|webp|bmp)$/.test(name) || type.includes('image') || type.includes('photo')) return 'image';
  if (/\.(txt|md|csv|json)$/.test(name)) return 'text';
  return 'unknown';
}

export async function analyserDocumentMission({ missionId, documentId } = {}) {
  const db = await getDb();
  const doc = await db.getFirstAsync('SELECT * FROM mission_documents WHERE id=? AND mission_id=?', [
    documentId,
    missionId
  ]);
  if (!doc?.file_uri) throw new Error('Document source introuvable.');

  const kind = documentKind(doc);
  let parts = [];
  if (kind === 'docx') parts = await extractDocx(doc.file_uri);
  else if (kind === 'pdf') parts = await extractPdf(doc.file_uri);
  else if (kind === 'image') parts = await extractImage(doc.file_uri);
  else if (kind === 'text') parts = await extractTextFile(doc.file_uri);
  else
    throw new Error(
      "Ce format n'est pas encore extractible localement. Le fichier reste néanmoins conservé dans la Mission."
    );

  const created = [];
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM mission_document_review_items WHERE document_id=?', [documentId]);
    await db.runAsync('DELETE FROM mission_document_extractions WHERE document_id=?', [documentId]);

    for (const part of parts) {
      const extractionId = createId('mdext');
      const structured = classifyLines(part.text);
      await db.runAsync(
        'INSERT INTO mission_document_extractions(id,mission_id,document_id,page_number,source_part,engine,status,raw_text,structured_json,duration_ms) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [
          extractionId,
          missionId,
          documentId,
          part.pageNumber,
          part.sourcePart,
          part.engine,
          'completed',
          part.text,
          JSON.stringify(structured),
          part.durationMs || null
        ]
      );

      for (const item of structured) {
        const reviewId = createId('mdrev');
        await db.runAsync(
          'INSERT INTO mission_document_review_items(id,mission_id,document_id,extraction_id,item_type,label,value_text,status,source_ref) VALUES(?,?,?,?,?,?,?,?,?)',
          [
            reviewId,
            missionId,
            documentId,
            extractionId,
            item.itemType,
            item.label,
            item.valueText,
            'to_review',
            part.pageNumber ? 'page ' + part.pageNumber : part.sourcePart
          ]
        );
        created.push(reviewId);
      }
    }
  });

  return { parts: parts.length, reviewItems: created.length, kind };
}

export async function listerInboxDocumentsMission(missionId) {
  const db = await getDb();
  const documents = await db.getAllAsync(
    `SELECT d.*,
      (SELECT COUNT(*) FROM mission_document_extractions e WHERE e.document_id=d.id) AS extraction_count,
      (SELECT COUNT(*) FROM mission_document_review_items r WHERE r.document_id=d.id AND r.status='to_review') AS review_count
     FROM mission_documents d WHERE d.mission_id=? ORDER BY d.created_at DESC`,
    [missionId]
  );
  const reviewItems = await db.getAllAsync(
    `SELECT r.*,d.name AS document_name FROM mission_document_review_items r
     JOIN mission_documents d ON d.id=r.document_id
     WHERE r.mission_id=? ORDER BY CASE r.status WHEN 'to_review' THEN 0 ELSE 1 END,r.document_id,r.created_at LIMIT 1000`,
    [missionId]
  );
  return { documents, reviewItems };
}

export async function accepterItemRevueMission(itemId) {
  const db = await getDb();
  const item = await db.getFirstAsync('SELECT * FROM mission_document_review_items WHERE id=?', [itemId]);
  if (!item) return null;

  let entityType = null;
  let entityId = null;

  if (item.item_type === 'action') {
    entityType = 'action';
    entityId = createId('mact');
    await db.runAsync('INSERT INTO mission_actions(id,mission_id,label,description,status) VALUES(?,?,?,?,?)', [
      entityId,
      item.mission_id,
      item.label || 'Action extraite',
      item.value_text,
      'open'
    ]);
  } else if (item.item_type === 'finding') {
    entityType = 'point';
    entityId = createId('mpt');
    await db.runAsync(
      'INSERT INTO mission_points(id,mission_id,type,label,description,status,source_type,source_id) VALUES(?,?,?,?,?,?,?,?)',
      [
        entityId,
        item.mission_id,
        'control',
        item.label || 'Constat extrait',
        item.value_text,
        'to_check',
        'document_extraction',
        item.document_id
      ]
    );
    await db.runAsync('INSERT INTO mission_point_history(id,point_id,status_after,comment,source) VALUES(?,?,?,?,?)', [
      createId('mphist'),
      entityId,
      'to_check',
      item.value_text,
      'document_extraction'
    ]);
  } else if (item.item_type === 'document') {
    entityType = 'note';
    entityId = createId('mnote');
    await db.runAsync('INSERT INTO mission_notes(id,mission_id,type,content,visibility) VALUES(?,?,?,?,?)', [
      entityId,
      item.mission_id,
      'document_extraction',
      item.value_text,
      'internal'
    ]);
  } else {
    entityType = 'note';
    entityId = createId('mnote');
    await db.runAsync('INSERT INTO mission_notes(id,mission_id,type,content,visibility) VALUES(?,?,?,?,?)', [
      entityId,
      item.mission_id,
      'document_extraction',
      item.value_text,
      'internal'
    ]);
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE mission_document_review_items SET status='accepted',target_entity_type=?,target_entity_id=?,updated_at=datetime('now') WHERE id=?",
      [entityType, entityId, itemId]
    );
    await db.runAsync(
      'INSERT INTO mission_provenance(id,mission_id,entity_type,entity_id,source_kind,source_document_id,source_value,confidence) VALUES(?,?,?,?,?,?,?,?)',
      [
        createId('mprov'),
        item.mission_id,
        entityType,
        entityId,
        'document_extraction',
        item.document_id,
        item.value_text,
        'user_confirmed'
      ]
    );
  });

  return { entityType, entityId };
}

export async function ignorerItemRevueMission(itemId) {
  const db = await getDb();
  await db.runAsync("UPDATE mission_document_review_items SET status='ignored',updated_at=datetime('now') WHERE id=?", [
    itemId
  ]);
}
