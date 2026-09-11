export const PILOTAGE_EXPORT_COLUMNS = Object.freeze([
  { key: 'site', label: 'Site' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'groupes', label: 'Groupe(s)' },
  { key: 'metier', label: 'Métier' },
  { key: 'date', label: 'Date visite' },
  { key: 'categorie', label: 'Catégorie' },
  { key: 'section', label: 'Section' },
  { key: 'point', label: 'Point contrôlé' },
  { key: 'avis', label: 'Avis' },
  { key: 'criticite', label: 'Criticité' },
  { key: 'criticite_libelle', label: 'Niveau criticité' },
  { key: 'constat', label: 'Constat / réserve' },
  { key: 'precision', label: 'Précision terrain' },
  { key: 'origine', label: 'Origine' },
  { key: 'delai', label: 'Délai' },
  { key: 'estimatif', label: 'Estimatif' },
  { key: 'photos', label: 'Photo(s)' },
  { key: 'action', label: 'Action à réaliser' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'entreprise', label: 'Entreprise' },
  { key: 'priorite', label: 'Priorité' },
  { key: 'echeance', label: 'Échéance' },
  { key: 'statut_traitement', label: 'Statut traitement' },
  { key: 'date_traitement', label: 'Date de traitement' },
  { key: 'suivi', label: 'Commentaire de suivi' },
]);

export const PILOTAGE_EXPORT_PRESETS = Object.freeze({
  reserves: {
    label: 'Réserves à traiter',
    statuses: ['N.S'],
    columns: ['site', 'adresse', 'groupes', 'metier', 'date', 'categorie', 'point', 'avis', 'criticite', 'criticite_libelle', 'constat', 'precision', 'photos', 'action', 'responsable', 'entreprise', 'priorite', 'echeance', 'statut_traitement', 'date_traitement', 'suivi'],
  },
  ns: {
    label: 'N.S uniquement',
    statuses: ['N.S'],
    columns: ['site', 'metier', 'date', 'categorie', 'section', 'point', 'avis', 'criticite', 'criticite_libelle', 'constat', 'precision', 'origine'],
  },
  non_releves: {
    label: 'Points non relevés',
    statuses: ['N.R', 'N.V'],
    columns: ['site', 'adresse', 'metier', 'date', 'categorie', 'section', 'point', 'avis', 'precision'],
  },
  photos: {
    label: 'Photos et réserves',
    statuses: ['N.S'],
    columns: ['site', 'metier', 'date', 'categorie', 'point', 'criticite', 'constat', 'precision', 'photos'],
  },
  suivi: {
    label: 'Suivi traitement',
    statuses: ['N.S'],
    columns: ['site', 'adresse', 'groupes', 'metier', 'categorie', 'point', 'criticite', 'criticite_libelle', 'constat', 'action', 'responsable', 'entreprise', 'priorite', 'echeance', 'statut_traitement', 'date_traitement', 'suivi'],
  },
});

export const PILOTAGE_DEFAULT_COLUMNS = Object.freeze(PILOTAGE_EXPORT_PRESETS.reserves.columns);
