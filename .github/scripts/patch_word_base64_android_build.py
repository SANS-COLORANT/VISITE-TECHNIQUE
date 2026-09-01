from pathlib import Path


p = Path('wordDocxExporter.js')
s = p.read_text(encoding='utf-8')

old_helper = "const dataUriBase64 = (value) => String(value || '').split(',')[1] || '';\n"
new_helper = r'''const normalizeBase64 = (value, label = 'donnée Word') => {
  let raw = String(value || '').trim();
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    raw = comma >= 0 ? raw.slice(comma + 1) : raw;
  }
  raw = raw
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/=]/g, '')
    .replace(/=/g, '');
  if (!raw) return '';
  const remainder = raw.length % 4;
  if (remainder === 1) throw new Error(`Base64 invalide pour ${label} (longueur ${raw.length}).`);
  if (remainder) raw += '='.repeat(4 - remainder);
  return raw;
};
const dataUriBase64 = (value) => normalizeBase64(value, 'asset de couverture');

async function writeBase64Async(uri, value, label) {
  const safeBase64 = normalizeBase64(value, label);
  if (!safeBase64) throw new Error(`Base64 vide pour ${label}.`);
  try {
    await FileSystem.writeAsStringAsync(uri, safeBase64, { encoding: FileSystem.EncodingType.Base64 });
  } catch (error) {
    const detail = String(error?.message || error || 'erreur inconnue');
    throw new Error(`Export Word — écriture ${label} impossible : ${detail}`);
  }
}
'''
if 'function writeBase64Async' not in s:
    if old_helper not in s:
        raise SystemExit('Word base64 helper marker not found')
    s = s.replace(old_helper, new_helper, 1)

old_media = "    await FileSystem.writeAsStringAsync(`${media}${filename}`, base64, { encoding: FileSystem.EncodingType.Base64 });\n"
new_media = "    await writeBase64Async(`${media}${filename}`, base64, `image ${filename}`);\n"
if new_media not in s:
    if old_media not in s:
        raise SystemExit('Word media base64 write marker not found')
    s = s.replace(old_media, new_media, 1)

old_export = """    const base64 = await FileSystem.readAsStringAsync(pack.zipUri, { encoding: FileSystem.EncodingType.Base64 });
    const destination = await SAF.createFileAsync(dossier, nom, MIME_DOCX);
    await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
    return destination;
"""
new_export = """    const base64 = normalizeBase64(
      await FileSystem.readAsStringAsync(pack.zipUri, { encoding: FileSystem.EncodingType.Base64 }),
      'package DOCX',
    );
    const destination = await SAF.createFileAsync(dossier, nom, MIME_DOCX);
    await writeBase64Async(destination, base64, 'fichier DOCX final');
    return destination;
"""
if new_export not in s:
    if old_export not in s:
        raise SystemExit('Word final base64 write marker not found')
    s = s.replace(old_export, new_export, 1)

p.write_text(s, encoding='utf-8')
print('Android DOCX base64 normalization and diagnostics installed.')
