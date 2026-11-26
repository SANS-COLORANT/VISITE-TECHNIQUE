/**
 * Modèles Word à balises — moteur pur (testé sous Node).
 *
 * Travaille sur word/document.xml (et en-têtes / pieds de page) d'un .docx
 * fourni par l'utilisateur :
 *   {{mission.nom}}                    valeur simple
 *   {{#reserves}} … {{/reserves}}      répétition (paragraphes, ligne de tableau ou texte)
 *   {{^reserves}} … {{/reserves}}      affiché seulement si la liste est vide
 * Word découpe souvent une balise en plusieurs morceaux de texte : chaque
 * paragraphe qui contient une balise est d'abord recollé en un seul morceau
 * (il prend la mise en forme de son premier morceau).
 */

const SENTINEL = '\u0001';
const PARAGRAPH_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const TEXT_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeXml(value) {
  return String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function paragraphText(p) {
  let out = '';
  for (const m of p.matchAll(TEXT_RE)) out += m[1];
  return out;
}

/** Recolle les balises coupées en plusieurs morceaux de texte par Word. */
export function normalizeTemplateXml(xml) {
  return String(xml).replace(PARAGRAPH_RE, (p) => {
    const text = paragraphText(p);
    if (!text.includes('{{') && !text.includes('}}')) return p;
    // Balise d'un seul tenant dans chaque morceau : rien à faire.
    const pieces = [...p.matchAll(TEXT_RE)].map((m) => m[1]);
    const intact = pieces.every((piece) => (piece.match(/\{\{/g) || []).length === (piece.match(/\}\}/g) || []).length && !/\{$|^\}/.test(piece));
    if (intact) return p;
    let first = true;
    return p.replace(TEXT_RE, () => {
      if (first) {
        first = false;
        return `<w:t xml:space="preserve">${text}</w:t>`;
      }
      return '<w:t></w:t>';
    });
  });
}

/** Balises présentes dans le modèle (pour l'aide et le contrôle avant génération). */
export function listTemplateTags(xml) {
  const tags = new Set();
  for (const m of normalizeTemplateXml(xml).matchAll(/\{\{\s*([#^/]?)\s*([\w.]+)\s*\}\}/g)) {
    tags.add(m[1] === '/' ? null : `${m[1]}${m[2]}`);
  }
  tags.delete(null);
  return [...tags];
}

function lookup(stack, path) {
  if (path === '.') return stack[0] && typeof stack[0] === 'object' && '.' in stack[0] ? stack[0]['.'] : undefined;
  const parts = path.split('.');
  for (const ctx of stack) {
    if (ctx == null || typeof ctx !== 'object') continue;
    if (!(parts[0] in ctx)) continue;
    let value = ctx;
    for (const part of parts) {
      if (value == null) return undefined;
      value = value[part];
    }
    return value;
  }
  return undefined;
}

function startOf(xml, index, openRe) {
  let best = -1;
  for (const m of xml.slice(0, index).matchAll(openRe)) best = m.index;
  return best;
}

function enclosing(xml, index, tag) {
  const open = startOf(xml, index, new RegExp(`<w:${tag}(?:\\s[^>]*)?>`, 'g'));
  if (open === -1) return null;
  const closeBefore = xml.lastIndexOf(`</w:${tag}>`, index);
  if (closeBefore > open) return null;
  const end = xml.indexOf(`</w:${tag}>`, index);
  if (end === -1) return null;
  return { start: open, end: end + `</w:${tag}>`.length };
}

function renderSections(xml, stack) {
  const openRe = /\{\{\s*([#^])\s*([\w.]+)\s*\}\}/;
  let out = xml;
  let guard = 0;
  for (;;) {
    const m = openRe.exec(out);
    if (!m || guard++ > 500) break;
    const [tag, kind, name] = m;
    const openIdx = m.index;
    const closeRe = new RegExp(`\\{\\{\\s*/\\s*${name.replace('.', '\\.')}\\s*\\}\\}`, 'g');
    closeRe.lastIndex = openIdx + tag.length;
    const close = closeRe.exec(out);
    if (!close) {
      out = out.slice(0, openIdx) + out.slice(openIdx + tag.length); // balise orpheline : retirée
      continue;
    }
    const value = lookup(stack, name);
    const items = Array.isArray(value) ? value : value ? [value] : [];
    const render = (block) => {
      if (kind === '^') return items.length ? '' : renderSections(block, stack);
      return items.map((item) => {
        const scoped = [item && typeof item === 'object' ? item : { '.': item }, ...stack];
        return renderVariables(renderSections(block, scoped), scoped);
      }).join('');
    };
    const openP = enclosing(out, openIdx, 'p');
    const closeP = enclosing(out, close.index, 'p');
    const openRow = enclosing(out, openIdx, 'tr');
    const closeRow = enclosing(out, close.index, 'tr');
    let start;
    let end;
    let block;
    if (openRow && closeRow) {
      // Dans un tableau : la ligne (ou les lignes) entre les balises est répétée.
      start = openRow.start;
      end = closeRow.end;
      block = openRow.start === closeRow.start
        ? out.slice(start, end).replace(tag, SENTINEL).replace(close[0], SENTINEL)
        : out.slice(openRow.end, closeRow.start); // lignes repères retirées
    } else if (openP && closeP && openP.start === closeP.start) {
      // Dans un même paragraphe : on répète le texte entre les balises.
      start = openIdx;
      end = close.index + close[0].length;
      block = out.slice(openIdx + tag.length, close.index);
    } else if (openP && closeP) {
      start = openP.start;
      end = closeP.end;
      block = out.slice(start, end).replace(tag, SENTINEL).replace(close[0], SENTINEL);
    } else {
      start = openIdx;
      end = close.index + close[0].length;
      block = out.slice(openIdx + tag.length, close.index);
    }
    out = out.slice(0, start) + render(block) + out.slice(end);
  }
  return out;
}

function renderVariables(xml, stack) {
  return xml.replace(/\{\{\s*([\w.]+|\.)\s*\}\}/g, (_, path) => {
    const value = lookup(stack, path);
    if (value == null || typeof value === 'object') return '';
    return escapeXml(value).replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
  });
}

function dropSentinelParagraphs(xml) {
  return xml
    .replace(PARAGRAPH_RE, (p) => (p.includes(SENTINEL) && paragraphText(p).replace(new RegExp(SENTINEL, 'g'), '').trim() === '' ? '' : p))
    .replace(new RegExp(SENTINEL, 'g'), '')
    // Une cellule de tableau doit garder au moins un paragraphe pour rester un .docx valide.
    .replace(/(<w:tc(?:\s[^>]*)?>(?:<w:tcPr>[\s\S]*?<\/w:tcPr>)?)(<\/w:tc>)/g, '$1<w:p/>$2');
}

/** Remplit un document.xml avec `data`. */
export function renderTemplateXml(xml, data) {
  const normalized = normalizeTemplateXml(xml);
  const stack = [data];
  return dropSentinelParagraphs(renderVariables(renderSections(normalized, stack), stack));
}

export { unescapeXml };
