/**
 * Fiche Mission modulable — registre des blocs, des outils et des dispositions
 * prêtes à l'emploi.
 *
 * Module pur (aucun import React Native) : il est lu par l'écran, par la
 * couche SQLite et par les tests Node. Ajouter un bloc ou un outil se fait ici,
 * une seule fois ; l'écran se contente d'afficher la disposition calculée.
 *
 * Aucune donnée Intranet n'est lue ni référencée (règle 9, docs/MISSIONS.md).
 */

export const SHEET_LAYOUT_VERSION = 1;

/** Tailles d'affichage d'un bloc. `compact` = l'essentiel, `detailed` = tout. */
export const SHEET_SIZES = Object.freeze(['compact', 'detailed']);

/** Portées d'enregistrement d'une disposition, de la plus précise à la plus générale. */
export const SHEET_SCOPES = Object.freeze(['mission', 'type', 'family']);

const has = (ctx, key) => ctx?.capabilities?.[key] === true;

/**
 * Blocs de la fiche. `locked` : toujours affiché, en tête, jamais déplacé.
 * `hideable: false` : peut bouger et changer de taille, mais pas disparaître
 * (l'accès à « Tous les outils » doit rester garanti). `column` : colonne
 * préférée sur tablette (deux colonnes à partir de 600 dp).
 */
export const SHEET_BLOCKS = Object.freeze([
  {
    key: 'header', label: 'En-tête', icon: 'building', locked: true, column: 'full',
    description: 'Titre, client, site et avancement des phases.',
  },
  {
    key: 'primary', label: 'Action principale', icon: 'play', locked: true, column: 'full',
    description: 'Reprendre ou démarrer une visite, ajouter un point.',
  },
  {
    key: 'todo', label: 'À traiter', icon: 'warning', column: 'left',
    description: 'Points ouverts, échéances dépassées et documents manquants.',
  },
  {
    key: 'visits', label: 'Visites', icon: 'clock', column: 'left',
    description: 'Visites de la Mission, brouillon en tête pour reprendre vite.',
  },
  {
    key: 'forms', label: 'Trames', icon: 'control', column: 'left',
    description: 'Trames rattachées à la Mission : nouvelle fiche, reprise d’un brouillon.',
    requires: (ctx) => ctx?.hasForms === true,
  },
  {
    key: 'progress', label: 'Progression', icon: 'route', column: 'left',
    description: 'Une seule frise : phases de la Mission et étapes du parcours recommandé.',
  },
  {
    key: 'reserves', label: 'Réserves', icon: 'flag', column: 'left',
    description: 'Réserves ouvertes, à contrôler et levées partielles.',
    requires: (ctx) => has(ctx, 'reserveClearance') || has(ctx, 'receptionBoard') || ctx?.family === 'travaux_chantier',
  },
  {
    key: 'sites', label: 'Avancement multi-sites', icon: 'location', column: 'left',
    description: 'Sites traités, en cours et à faire sur la campagne.',
    requires: (ctx) => has(ctx, 'map') || has(ctx, 'campaignDashboard'),
  },
  {
    key: 'tools', label: 'Outils épinglés', icon: 'tools', column: 'right', hideable: false,
    description: 'Les outils dont tu te sers, et l’accès à tous les autres.',
  },
  {
    key: 'measures', label: 'Mesures récentes', icon: 'gauge', column: 'right',
    description: 'Dernières valeurs relevées sur la Mission.',
  },
  {
    key: 'expectedDocuments', label: 'Documents attendus', icon: 'document', column: 'right',
    description: 'Pièces attendues, VISA et échéances.',
  },
  {
    key: 'indicators', label: 'Indicateurs', icon: 'chart', column: 'right',
    description: 'Actions, constats, essais, scénarios et calculs, seulement s’ils existent.',
  },
  {
    key: 'deliverables', label: 'Livrables', icon: 'export', column: 'right',
    description: 'Rapport Word/PDF, Excel client et dossier complet.',
  },
]);

export const SHEET_BLOCK_BY_KEY = Object.freeze(Object.fromEntries(SHEET_BLOCKS.map((block) => [block.key, block])));

/** Taille par défaut de chaque bloc. */
export const SHEET_DEFAULT_SIZES = Object.freeze({
  header: 'detailed',
  primary: 'detailed',
  todo: 'detailed',
  visits: 'compact',
  forms: 'detailed',
  progress: 'compact',
  reserves: 'detailed',
  sites: 'detailed',
  tools: 'detailed',
  measures: 'compact',
  expectedDocuments: 'compact',
  indicators: 'compact',
  deliverables: 'compact',
});

/** Ordre par défaut des blocs (hors blocs verrouillés), par famille de Mission. */
export const SHEET_FAMILY_DEFAULTS = Object.freeze({
  etude_audit: ['todo', 'visits', 'forms', 'progress', 'tools', 'measures', 'indicators', 'deliverables'],
  travaux_chantier: ['todo', 'reserves', 'visits', 'forms', 'progress', 'expectedDocuments', 'tools', 'indicators', 'deliverables'],
  suivi_ponctuel: ['todo', 'visits', 'forms', 'tools', 'progress', 'measures', 'deliverables'],
  campagne_multisites: ['sites', 'todo', 'visits', 'forms', 'tools', 'measures', 'progress', 'deliverables'],
  conformite_reglementaire: ['todo', 'visits', 'forms', 'tools', 'progress', 'measures', 'deliverables'],
  default: ['todo', 'visits', 'forms', 'progress', 'tools', 'indicators', 'deliverables'],
});

/** Ordres propres à certains types, plus parlants que celui de leur famille. */
export const SHEET_TYPE_DEFAULTS = Object.freeze({
  opr_reception: ['reserves', 'todo', 'visits', 'forms', 'expectedDocuments', 'tools', 'progress', 'deliverables'],
  levee_reserves: ['reserves', 'todo', 'visits', 'forms', 'tools', 'progress', 'deliverables'],
  passation_travaux_exploitant: ['todo', 'expectedDocuments', 'reserves', 'visits', 'forms', 'tools', 'progress', 'deliverables'],
  commissioning: ['todo', 'visits', 'forms', 'progress', 'tools', 'expectedDocuments', 'indicators', 'deliverables'],
  assistance_p2_p3: ['todo', 'visits', 'forms', 'indicators', 'tools', 'progress', 'deliverables'],
  expertise_sinistre: ['todo', 'visits', 'forms', 'indicators', 'tools', 'progress', 'deliverables'],
  campagne_mesures: ['sites', 'measures', 'todo', 'visits', 'forms', 'tools', 'progress', 'deliverables'],
});

/** Dispositions prêtes à l'emploi : un appui pour les appliquer, puis on ajuste. */
export const SHEET_PRESETS = Object.freeze([
  {
    key: 'terrain',
    label: 'Terrain',
    icon: 'camera',
    description: 'Sur place : points à traiter, visites, outils et dernières mesures en premier.',
    blocks: [['todo', 'detailed'], ['reserves', 'detailed'], ['visits', 'detailed'], ['tools', 'detailed'], ['measures', 'compact'], ['progress', 'compact']],
  },
  {
    key: 'bureau',
    label: 'Bureau',
    icon: 'document',
    description: 'Pour préparer et rendre : indicateurs, livrables, documents et parcours détaillé.',
    blocks: [['indicators', 'detailed'], ['deliverables', 'detailed'], ['expectedDocuments', 'detailed'], ['progress', 'detailed'], ['todo', 'compact'], ['visits', 'compact'], ['tools', 'compact']],
  },
  {
    key: 'minimal',
    label: 'Minimal',
    icon: 'list',
    description: 'Le strict nécessaire : points à traiter, visites et outils épinglés.',
    blocks: [['todo', 'compact'], ['visits', 'compact'], ['tools', 'compact']],
  },
]);

/** Groupes de « Tous les outils ». */
export const SHEET_TOOL_GROUPS = Object.freeze([
  { key: 'terrain', label: 'Terrain' },
  { key: 'patrimoine', label: 'Patrimoine et technique' },
  { key: 'analyse', label: 'Analyse et pilotage' },
  { key: 'livrables', label: 'Livrables et documents' },
]);

/**
 * Les 27 outils de la Mission. La clé est celle des capacités
 * (`getMissionCapabilities`) : un outil n'est proposé que si le type le permet.
 */
export const SHEET_TOOLS = Object.freeze([
  { key: 'forms', route: 'MissionForms', title: 'Trames & formulaires', subtitle: 'Champs · conditions · calculs · avis', icon: 'control', group: 'terrain' },
  { key: 'measurements', route: 'MissionMeasurements', title: 'Mesures', subtitle: 'Références · séries · instruments', icon: 'gauge', group: 'terrain' },
  { key: 'plans', route: 'MissionPlan', title: 'Plans / PDF / SIG', subtitle: 'Mesures · calques · GeoPackage', icon: 'map', group: 'terrain' },
  { key: 'photoAnnotations', route: 'MissionPhotoAnnotations', title: 'Photos annotées', subtitle: 'Flèches · zones · texte', icon: 'camera', group: 'terrain' },
  { key: 'tests', route: 'MissionTests', title: 'Essais', subtitle: 'Protocoles · commissioning', icon: 'flash', group: 'terrain' },
  { key: 'controlBoard', route: 'MissionControlBoard', title: 'Contrôles ciblés', subtitle: 'Référence → preuve → action → recontrôle', icon: 'control', group: 'terrain' },
  { key: 'reserveClearance', route: 'MissionReserveClearance', title: 'Levée de réserves', subtitle: 'Avant / après · levée · maintien · partielle', icon: 'tick', group: 'terrain' },
  { key: 'receptionBoard', route: 'MissionReceptionBoard', title: 'Réception / mise en service', subtitle: 'Ouvrages · essais · réserves · documents', icon: 'regulation', group: 'terrain' },
  { key: 'map', route: 'MissionMap', title: 'Cartographie', subtitle: 'Multi-sites · progression · SIG', icon: 'location', group: 'terrain' },
  { key: 'structure', route: 'MissionStructure', title: 'Patrimoine', subtitle: 'Site · bâtiment · niveau · local', icon: 'building', group: 'patrimoine' },
  { key: 'technicalStructure', route: 'MissionTechnicalStructure', title: 'Architecture technique', subtitle: 'Installation · système · réseau · équipement', icon: 'controller', group: 'patrimoine' },
  { key: 'equipment', route: 'MissionEquipment', title: 'Inventaire', subtitle: 'Équipements · composants · OCR', icon: 'tools', group: 'patrimoine' },
  { key: 'synoptic', route: 'MissionTechnicalGraph', title: 'Synoptique', subtitle: 'Relations techniques visuelles', icon: 'network', group: 'patrimoine' },
  { key: 'workflow', route: 'MissionWorkflow', title: 'Workflow', subtitle: 'Phases · volets · occurrences', icon: 'route', group: 'analyse' },
  { key: 'actions', route: 'MissionActions', title: 'Actions', subtitle: 'Responsables · échéances · coûts', icon: 'flag', group: 'analyse' },
  { key: 'subjects', route: 'MissionSubjects', title: 'Sujets & décisions', subtitle: 'Constat → décision → action → historique', icon: 'remark', group: 'analyse' },
  { key: 'calculations', route: 'MissionCalculation', title: 'Calculs', subtitle: 'Formules · hypothèses · résultats', icon: 'calculator', group: 'analyse' },
  { key: 'scenarios', route: 'MissionScenarios', title: 'Scénarios', subtitle: 'Étude · investissement · gains', icon: 'chart', group: 'analyse' },
  { key: 'expertiseBoard', route: 'MissionExpertise', title: 'Expertise / sinistre', subtitle: 'Faits → hypothèses → investigations → conclusion', icon: 'search', group: 'analyse' },
  { key: 'p3Dashboard', route: 'MissionP3Dashboard', title: 'Projection P2 / P3', subtitle: 'Âge · coût · échéance · renouvellement', icon: 'clock', group: 'analyse' },
  { key: 'amoDashboard', route: 'MissionAmoDashboard', title: 'Pilotage AMO', subtitle: 'Volets · année · actions · P3 · livrables', icon: 'groups', group: 'analyse' },
  { key: 'campaignDashboard', route: 'MissionCampaignDashboard', title: 'Cockpit multi-sites', subtitle: 'À faire · en cours · terminés · accès', icon: 'grid', group: 'analyse' },
  { key: 'documents', route: 'MissionDocuments', title: 'Documents / VISA', subtitle: 'Attendus · validation', icon: 'document', group: 'livrables' },
  { key: 'inbox', route: 'MissionDocumentInbox', title: 'Inbox documents', subtitle: 'Extraction locale · revue', icon: 'download', group: 'livrables' },
  { key: 'excelMapping', route: 'MissionExcelMapping', title: 'Mapping Excel', subtitle: 'Colonnes externes → METRA', icon: 'list', group: 'livrables' },
  { key: 'signature', route: 'MissionSignature', title: 'Signature', subtitle: 'Passation · OPR · réception', icon: 'edit', group: 'livrables' },
  { key: 'package', route: 'MissionPackage', title: 'Dossier complet', subtitle: 'ZIP configurable', icon: 'storage', group: 'livrables' },
]);

export const SHEET_TOOL_BY_KEY = Object.freeze(Object.fromEntries(SHEET_TOOLS.map((tool) => [tool.key, tool])));
export const SHEET_TOOL_BY_ROUTE = Object.freeze(Object.fromEntries(SHEET_TOOLS.map((tool) => [tool.route, tool.key])));

/** Outils ajoutés aux épingles par défaut quand le parcours en propose peu. */
export const SHEET_FAMILY_TOOL_FILL = Object.freeze({
  etude_audit: ['equipment', 'measurements', 'plans', 'calculations', 'documents'],
  travaux_chantier: ['actions', 'reserveClearance', 'documents', 'photoAnnotations', 'plans'],
  suivi_ponctuel: ['actions', 'measurements', 'equipment', 'documents'],
  campagne_multisites: ['campaignDashboard', 'map', 'measurements', 'equipment'],
  conformite_reglementaire: ['controlBoard', 'tests', 'documents', 'measurements'],
  default: ['equipment', 'measurements', 'plans', 'documents', 'actions'],
});

export const SHEET_MIN_PINNED = 4;
export const SHEET_MAX_PINNED = 8;

/**
 * Indicateurs de la Mission : clé du résumé SQLite (`getMissionDomainSummary`)
 * et outil ouvert au toucher. Un indicateur à zéro n'est pas affiché.
 */
export const SHEET_INDICATORS = Object.freeze([
  { key: 'open_actions', label: 'actions ouvertes', singular: 'action ouverte', tool: 'actions' },
  { key: 'observations', label: 'constats', singular: 'constat', tool: 'subjects' },
  { key: 'hypotheses', label: 'hypothèses', singular: 'hypothèse', tool: 'expertiseBoard' },
  { key: 'tests', label: 'essais', singular: 'essai', tool: 'tests' },
  { key: 'scenarios', label: 'scénarios', singular: 'scénario', tool: 'scenarios' },
  { key: 'expected_documents', label: 'documents attendus', singular: 'document attendu', tool: 'documents' },
  { key: 'calculations', label: 'calculs', singular: 'calcul', tool: 'calculations' },
]);

/** Types de points Mission (docs/MISSIONS.md) et leur pictogramme. */
export const SHEET_POINT_TYPES = Object.freeze([
  { key: 'reserve', label: 'Réserve', icon: 'flag' },
  { key: 'action', label: 'Action', icon: 'flash' },
  { key: 'request', label: 'Demande', icon: 'note' },
  { key: 'control', label: 'Contrôle', icon: 'control' },
  { key: 'decision', label: 'Décision', icon: 'tick' },
  { key: 'information', label: 'Information', icon: 'remark' },
]);

export const SHEET_POINT_STATUS = Object.freeze({
  open: 'Ouvert',
  in_progress: 'En cours',
  waiting: 'En attente',
  to_check: 'À contrôler',
  closed: 'Clôturé',
  no_follow_up: 'Sans suite',
});

export const SHEET_CLOSED_POINT_STATUSES = Object.freeze(['closed', 'no_follow_up']);
export const SHEET_RESUMABLE_VISIT_STATUSES = Object.freeze(['draft', 'in_progress']);
