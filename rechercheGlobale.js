/**
 * Recherche globale de l'accueil : clients, sites, locaux et règles (fiches
 * d'aide). Module pur : normalisation, filtrage par mots et classement.
 */
export const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Mots de la requête, à partir de deux lettres au total. */
export function motsRequete(texte) {
  const n = norm(texte);
  return n.length < 2 ? [] : n.split(/\s+/).filter(Boolean);
}

/** Score d'un libellé : 0 = ne correspond pas ; plus haut = meilleur. */
export function scorer(libelle, mots) {
  const n = norm(libelle);
  if (!mots.length || !mots.every((m) => n.includes(m))) return 0;
  let score = 10;
  if (n === mots.join(' ')) score += 40;
  else if (n.startsWith(mots[0])) score += 20;
  else if (n.split(/[\s\-·'’/]+/).some((w) => w.startsWith(mots[0]))) score += 10;
  return score - Math.min(5, Math.floor(n.length / 40));
}

const trier = (items) => items.sort((a, b) => b.score - a.score || a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' }));

/**
 * @param {string} texte
 * @param {{clients:Array, structures:Array, themes:Array}} source
 *   clients: { id, nom }  ·  structures: { clientId, nomClient, siteId, nomSite, installationId?, nomLocal? }
 *   themes: { id, title, scope }
 */
export function rechercherPartout(texte, { clients = [], structures = [], themes = [] } = {}, limite = 5) {
  const mots = motsRequete(texte);
  if (!mots.length) return { vide: true, groupes: [] };
  const groupes = [];

  const cl = trier(clients.map((c) => ({ score: scorer(c.nom, mots), type: 'client', cle: `c:${c.id}`, titre: c.nom, sous: 'Client', cible: { ecran: 'ClientSites', params: { clientId: c.id, nomClient: c.nom } } })).filter((r) => r.score));
  if (cl.length) groupes.push({ id: 'clients', titre: 'Clients', items: cl.slice(0, limite), total: cl.length });

  const locaux = trier(structures.filter((s) => s.installationId).map((s) => ({
    score: Math.max(scorer(s.nomLocal, mots), scorer(`${s.nomLocal} ${s.nomSite}`, mots)),
    type: 'local', cle: `l:${s.installationId}`, titre: s.nomLocal, sous: [s.nomClient, s.nomSite].filter(Boolean).join(' · '),
    cible: { ecran: 'SiteVisites', params: { siteId: s.siteId, nomSite: s.nomSite, installationId: s.installationId, nomLocal: s.nomLocal, clientId: s.clientId, nomClient: s.nomClient } },
  })).filter((r) => r.score));
  if (locaux.length) groupes.push({ id: 'locaux', titre: 'Locaux', items: locaux.slice(0, limite), total: locaux.length });

  const vus = new Set();
  const sites = trier(structures.filter((s) => { if (vus.has(s.siteId)) return false; vus.add(s.siteId); return true; }).map((s) => ({
    score: scorer(s.nomSite, mots), type: 'site', cle: `s:${s.siteId}`, titre: s.nomSite, sous: s.nomClient || 'Site',
    cible: { ecran: 'SiteLocals', params: { siteId: s.siteId, nomSite: s.nomSite, clientId: s.clientId, nomClient: s.nomClient } },
  })).filter((r) => r.score));
  if (sites.length) groupes.push({ id: 'sites', titre: 'Sites', items: sites.slice(0, limite), total: sites.length });

  const regles = trier(themes.map((t) => ({
    score: Math.max(scorer(t.title, mots), scorer(`${t.title} ${t.scope || ''}`, mots) - 5),
    type: 'regle', cle: `r:${t.id}`, titre: t.title, sous: t.scope || 'Règle', cible: { aide: t.id },
  })).filter((r) => r.score));
  if (regles.length) groupes.push({ id: 'regles', titre: 'Règles et repères', items: regles.slice(0, limite), total: regles.length });

  return { vide: groupes.length === 0, groupes };
}
