/**
 * « Ma journée » : synthèse de l'accueil à partir de l'itinéraire, des envois
 * en attente et des réserves ouvertes. Module pur, sans accès base.
 */

/** Cibles d'itinéraire (lignes SQL à plat) → bilan global, prochain local, restes par client. */
export function resumerItineraire(cibles = []) {
  const total = cibles.length;
  const faits = cibles.filter((c) => Number(c.fait) === 1).length;
  const restantes = cibles.filter((c) => Number(c.fait) !== 1);
  const parClient = new Map();
  for (const c of cibles) {
    const cle = String(c.client_id);
    const entree = parClient.get(cle) || { clientId: cle, nomClient: c.nom_client || 'Client', total: 0, faits: 0 };
    entree.total += 1;
    if (Number(c.fait) === 1) entree.faits += 1;
    parClient.set(cle, entree);
  }
  const clients = [...parClient.values()]
    .filter((c) => c.faits < c.total)
    .sort((a, b) => (b.total - b.faits) - (a.total - a.faits) || a.nomClient.localeCompare(b.nomClient, 'fr', { sensitivity: 'base' }));
  const prochaine = restantes[0] || null;
  return {
    total, faits, restants: total - faits,
    pct: total ? Math.round((faits / total) * 100) : 0,
    prochain: prochaine ? {
      clientId: String(prochaine.client_id), nomClient: prochaine.nom_client || '',
      siteId: String(prochaine.site_id), nomSite: prochaine.nom_site || '',
      installationId: prochaine.installation_id ? String(prochaine.installation_id) : null,
      nomLocal: prochaine.nom_local || '',
    } : null,
    clients,
  };
}

/** Libellé court d'une cible : « Site · Local » ou « Site ». */
export function libelleCible(cible) {
  if (!cible) return '';
  return [cible.nomSite, cible.nomLocal].filter(Boolean).join(' · ');
}

/** Phrase du bouton principal. */
export function libelleReprise(itineraire) {
  if (!itineraire?.prochain) return '';
  return `Reprendre · ${libelleCible(itineraire.prochain)}`;
}

/** Vrai quand la carte vaut la peine d'être affichée. */
export function journeeUtile({ itineraire, aEnvoyer = 0, reserves = 0 } = {}) {
  return Boolean(itineraire?.total) || aEnvoyer > 0 || reserves > 0;
}
