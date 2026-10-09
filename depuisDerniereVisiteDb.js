/** Données de « Depuis la dernière visite » pour un local (ou un site sans local). */
import { getDb } from './db.js';
import { resumerDepuisDerniereVisite } from './depuisDerniereVisite.js';

export async function chargerDepuisDerniereVisite({ siteId, installationId = null }) {
  if (!siteId) return null;
  const db = await getDb();
  const portee = installationId ? 'v.installation_id=?' : 'v.installation_id IS NULL';
  const argsPortee = installationId ? [String(installationId)] : [];
  const derniere = await db.getFirstAsync(
    `SELECT v.id, v.date_visite FROM visites v
      WHERE v.site_id=? AND ${portee}
        AND NOT EXISTS(SELECT 1 FROM provenances p WHERE p.entite_type='visite' AND p.entite_id=v.id AND p.origine='api_symfony' AND p.details_json LIKE '%"sourceType":"imported_latest_visit"%')
      ORDER BY COALESCE(v.date_visite,'') DESC, COALESCE(v.modifie_le,'') DESC LIMIT 1`,
    [String(siteId), ...argsPortee]);
  if (!derniere?.id) return null;
  const [reserves, materiel, releves] = await Promise.all([
    db.getAllAsync(
      `SELECT r.id, COALESCE(NULLIF(trim(r.poste),''), NULLIF(trim(r.prestation),''), 'Réserve') AS poste
         FROM reserves_suivi r JOIN visites v ON v.id=r.source_visite_id
        WHERE r.site_id=? AND r.statut='ouverte' AND ${portee} ORDER BY r.cree_le`, [String(siteId), ...argsPortee]),
    db.getAllAsync(`SELECT designation, categorie, etat, ajoute_pendant_visite AS ajoute FROM materiel WHERE visite_id=? ORDER BY rowid`, [derniere.id]),
    db.getAllAsync(`SELECT COALESCE(NULLIF(c.label,''), cs.libelle, 'Compteur') AS label, c.valeur, c.unite
                      FROM compteurs c LEFT JOIN compteurs_site cs ON cs.id=c.compteur_site_id WHERE c.visite_id=? ORDER BY c.rowid`, [derniere.id]),
  ]);
  const surveilles = (materiel || []).filter((m) => /v[ée]tuste|hors service/i.test(String(m.etat || '')))
    .map((m) => ({ designation: m.designation || m.categorie, etat: m.etat }));
  return resumerDepuisDerniereVisite({
    derniere, reserves: reserves || [], equipementsSurveilles: surveilles,
    equipementsAjoutes: (materiel || []).filter((m) => Number(m.ajoute) === 1).length,
    equipementsTotal: (materiel || []).length, releves: releves || [],
  });
}
