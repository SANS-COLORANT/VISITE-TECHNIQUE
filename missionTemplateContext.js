/**
 * Modèles Word à balises — données mises à disposition du modèle.
 * Module pur : reçoit les lignes SQLite déjà lues, renvoie l'objet de balises.
 * TEMPLATE_TAG_HELP sert d'aide dans l'application (balises copiables).
 */
import { flattenEntry, normalizeFormFields, slugFieldKey, summarizeEntry, formatFieldValue } from './missionFormEngine.js';

const POINT_TYPES = { reserve: 'Réserve', action: 'Action', request: 'Demande', control: 'Contrôle', decision: 'Décision', information: 'Information' };
const POINT_STATUS = { open: 'Ouvert', in_progress: 'En cours', waiting: 'En attente', to_check: 'À contrôler', closed: 'Clôturé', no_follow_up: 'Sans suite' };
const MISSION_STATUS = { draft: 'Brouillon', active: 'En cours', waiting: 'En attente', closed: 'Clôturée', cancelled: 'Annulée' };
const VISIT_STATUS = { draft: 'Brouillon', in_progress: 'En cours', completed: 'Terminée' };

const frDate = (value) => {
  if (!value) return '';
  const d = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : String(value);
};

export function templateFormKey(form, taken = []) {
  return `trame_${slugFieldKey(form.label, taken.map((k) => k.replace(/^trame_/, '')))}`;
}

export function buildMissionTemplateData({ mission = {}, typeLabel = '', sites = [], points = [], measures = [], visits = [], forms = [], entries = [], now = new Date() } = {}) {
  const pts = points.map((p) => ({
    intitule: p.label || '',
    type: POINT_TYPES[p.type] || p.type || '',
    statut: POINT_STATUS[p.status] || p.status || '',
    echeance: p.due_date ? frDate(p.due_date) : (p.due_text || ''),
    description: p.description || '',
    ouvert: !['closed', 'no_follow_up'].includes(p.status),
  }));
  const reserves = pts.filter((_, i) => points[i].type === 'reserve');
  const data = {
    date_du_jour: frDate(new Date(now).toISOString()),
    mission: {
      nom: mission.label || '',
      reference: mission.reference || '',
      type: typeLabel || mission.type || '',
      statut: MISSION_STATUS[mission.status] || mission.status || '',
      client: mission.client_name || '',
      responsable: mission.responsible_name || '',
      description: mission.description || '',
      debut: frDate(mission.start_date),
      fin: frDate(mission.end_date),
    },
    sites: sites.map((s) => ({ nom: s.name || '', ville: s.city || '', adresse: s.address || '' })),
    points: pts,
    points_ouverts: pts.filter((p) => p.ouvert),
    reserves,
    reserves_ouvertes: reserves.filter((p) => p.ouvert),
    mesures: measures.map((m) => ({
      type: m.type || '',
      valeur: m.value_number != null ? String(m.value_number).replace('.', ',') : (m.value_text || ''),
      unite: m.unit || '',
      date: frDate(m.measured_at || m.created_at),
    })),
    visites: visits.map((v) => ({ type: v.visit_type || 'Visite', date: frDate(v.visit_date || v.created_at), statut: VISIT_STATUS[v.status] || v.status || '' })),
    nb: {},
    trames: [],
  };
  data.nb = {
    reserves: reserves.length,
    reserves_ouvertes: data.reserves_ouvertes.length,
    points_ouverts: data.points_ouverts.length,
    mesures: data.mesures.length,
    visites: data.visites.length,
  };
  const keys = [];
  for (const form of forms) {
    const fields = normalizeFormFields(form.fields_json ?? form.fields);
    const key = templateFormKey(form, keys);
    keys.push(key);
    const fiches = entries.filter((e) => e.form_id === form.id).map((entry) => {
      const values = typeof entry.values_json === 'string' ? JSON.parse(entry.values_json || '{}') : (entry.values || {});
      const { values: computed } = summarizeEntry(fields, values);
      const row = { cible: entry.target_label || '', statut: entry.status === 'done' ? 'Terminée' : 'Brouillon', champs: flattenEntry(fields, values).map((f) => ({ libelle: f.label, valeur: f.value })) };
      for (const field of fields) if (field.type !== 'section') row[field.key] = formatFieldValue(field, computed[field.key]);
      return row;
    });
    data[key] = fiches;
    data.trames.push({ nom: form.label, cle: key, fiches });
  }
  return data;
}

export const TEMPLATE_TAG_HELP = Object.freeze([
  { tag: '{{mission.nom}}', label: 'Nom de la Mission' },
  { tag: '{{mission.reference}}', label: 'Référence affaire' },
  { tag: '{{mission.client}}', label: 'Client' },
  { tag: '{{mission.type}}', label: 'Type de Mission' },
  { tag: '{{mission.responsable}}', label: 'Responsable' },
  { tag: '{{date_du_jour}}', label: 'Date de génération' },
  { tag: '{{nb.reserves_ouvertes}}', label: 'Nombre de réserves ouvertes' },
  { tag: '{{#sites}}{{nom}} – {{ville}}{{/sites}}', label: 'Liste des sites' },
  { tag: '{{#reserves}}{{intitule}} · {{statut}} · {{echeance}}{{/reserves}}', label: 'Réserves (mettre dans une ligne de tableau pour un tableau)' },
  { tag: '{{^reserves}}Aucune réserve.{{/reserves}}', label: 'Texte si aucune réserve' },
  { tag: '{{#points_ouverts}}{{type}} : {{intitule}}{{/points_ouverts}}', label: 'Points ouverts' },
  { tag: '{{#mesures}}{{type}} : {{valeur}} {{unite}} ({{date}}){{/mesures}}', label: 'Mesures' },
  { tag: '{{#visites}}{{type}} du {{date}}{{/visites}}', label: 'Visites' },
  { tag: '{{#trames}}{{nom}} : {{#fiches}}{{cible}}{{/fiches}}{{/trames}}', label: 'Toutes les trames et leurs fiches' },
  { tag: '{{#trame_<nom>}}{{<clé du champ>}}{{/trame_<nom>}}', label: 'Fiches d’une trame, champ par champ (clés visibles dans le constructeur)' },
]);
