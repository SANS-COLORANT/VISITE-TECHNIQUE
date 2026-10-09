/**
 * Tournée : sites ou locaux à visiter pour un client (liste de contrôle).
 *
 * Une cible est « faite » dès qu'une visite est créée sur ce local (ou, pour
 * une cible de site, sur n'importe quel local du site) après l'ajout de la
 * cible : l'état est déduit des visites, il n'est jamais saisi à la main et
 * ne peut donc pas diverger. Migration purement additive.
 */
export const migration047 = {
  version: 47,
  name: 'tournee_cibles',
  sql: `
    CREATE TABLE IF NOT EXISTS tournee_cibles (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      installation_id TEXT REFERENCES installations(id) ON DELETE CASCADE,
      cle TEXT NOT NULL UNIQUE,
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tournee_cibles_client ON tournee_cibles(client_id);
  `,
};
