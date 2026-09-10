/** Pure photo-reference transformations. Never mutate a flattened copy. */
export function mapLatestVisitPhotos(manifest, mapper) {
  if (!manifest) return null;
  return { ...manifest, sites: (manifest.sites || []).map((entry) => ({
    ...entry, locaux: (entry.locaux || []).map((room) => ({
      ...room, photos: (room.photos || []).map((photo) => mapper({
        ...photo, site: entry.site, local: room.local, derniereVisite: room.derniereVisite,
      })),
    })),
  })) };
}

export function photoFileKey(photo) {
  // The API has no checksum/version: equal metadata cannot prove equal bytes.
  return JSON.stringify([photo.site?.id, photo.local?.id, photo.derniereVisite?.id,
    photo.id, photo.typeMime, photo.tailleOctets, photo.largeurPixels, photo.hauteurPixels]
    .map((v) => v == null ? '' : String(v)));
}

export function filterLatestVisitPhotos(manifest, { siteIds = null, localIds = null, photoIds = null } = {}) {
  if (!manifest) return null;
  const set = (ids) => ids == null ? null : new Set(ids.map(String));
  const sites = set(siteIds), locals = set(localIds), photos = set(photoIds);
  // An explicit empty selection must NEVER expand to the entire client.
  return { ...manifest, sites: (manifest.sites || []).filter((s) => !sites || sites.has(String(s.site?.id)))
    .map((s) => ({ ...s, locaux: (s.locaux || []).filter((l) => !locals || locals.has(String(l.local?.id)))
      .map((l) => ({ ...l, photos: (l.photos || []).filter((p) => !photos || photos.has(String(p.id))) })) })) };
}

export function photoSummary(manifest) {
  if (!manifest) return { known: false, total: 0, saved: 0, missing: 0, unavailable: 0, bytes: 0, unknownSizes: 0 };
  const photos = (manifest.sites || []).flatMap((s) => (s.locaux || []).flatMap((l) => l.photos || []));
  const saved = photos.filter((p) => p.localAvailable && p.localUri).length;
  const missing = photos.filter((p) => p.disponible && !(p.localAvailable && p.localUri));
  return { known: true, total: photos.length, saved, missing: missing.length,
    unavailable: photos.filter((p) => !p.disponible && !(p.localAvailable && p.localUri)).length,
    bytes: missing.reduce((n, p) => n + Number(p.tailleOctets || 0), 0),
    unknownSizes: missing.filter((p) => !Number(p.tailleOctets)).length };
}

export function photoStatusLabel(summary) {
  if (!summary?.known) return 'Photos : disponibilité non vérifiée';
  if (!summary.total) return 'Aucune photo dans cette référence';
  return `Photos : ${summary.saved}/${summary.total} enregistrées${summary.missing ? ` · ${summary.missing} à récupérer` : ''}${summary.unavailable ? ` · ${summary.unavailable} indisponibles` : ''}`;
}

export function referenceSignature(manifest) {
  return JSON.stringify((manifest?.sites || []).flatMap((s) => (s.locaux || []).map((l) =>
    [String(s.site?.id), String(l.local?.id), String(l.derniereVisite?.id || ''),
      (l.photos || []).map((p) => photoFileKey({ ...p, site: s.site, local: l.local, derniereVisite: l.derniereVisite })).sort()]
  )).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export function formatPhotoBytes(bytes) {
  return Number(bytes) >= 1048576 ? `${(bytes / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
    : `${Math.ceil(Number(bytes || 0) / 1024)} Ko`;
}

export function formatPhotoDate(value) {
  if (!value) return 'date non renseignée';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('fr-FR');
}
