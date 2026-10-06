/**
 * Destination d'export des compteurs, indépendante du nom affiché.
 *
 * Avant cette migration, la ligne Excel et le critère Intranet d'un compteur
 * étaient déduits de son libellé : renommer « Compteur gaz » en « Chaudière 1 »
 * retirait silencieusement l'index du rapport. La colonne destination contient la clé
 * du champ de relevé de la trame (ex. « Index compteur énergie (MWh) ») ou
 * « supplementaire ». NULL = compteur historique : la règle de libellé
 * existante reste appliquée tant que le technicien ne l'a pas renommé.
 * Migration purement additive : aucune donnée existante n'est modifiée.
 */
export const migration045 = {
  version: 45,
  name: 'meter_export_destination',
  sql: `
    ALTER TABLE compteurs ADD COLUMN destination TEXT;
    ALTER TABLE compteurs_site ADD COLUMN destination TEXT;
  `,
};
