/**
 * Pictogrammes et noms courts des relevés (index de compteurs, pressions,
 * températures) : la saisie terrain se repère d'un coup d'œil sans lire les
 * libellés longs de la trame. Les libellés d'origine restent ceux des
 * rapports et des exports (rien n'est renommé en base).
 */
const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Index / compteurs et pressions.
export function pictoReleve(label) {
  const t = norm(label);
  if (/pression/.test(t)) {
    if (/ecs|sanitaire/.test(t)) return { icon: 'gauge', court: 'Pression ECS', teinte: '#B54708', unite: 'bar' };
    return { icon: 'gauge', court: 'Pression chauffage', teinte: '#C2410C', unite: 'bar' };
  }
  if (/manometre/.test(t)) return { icon: 'gauge', court: /ecs/.test(t) ? 'Manomètre ECS' : 'Manomètre chauffage', teinte: '#C2410C', unite: 'bar' };
  if (/gaz|fioul|cuve/.test(t)) return { icon: 'flame', court: /fioul|cuve/.test(t) && /gaz/.test(t) ? 'Gaz · fioul' : /fioul|cuve/.test(t) ? 'Fioul' : 'Gaz', teinte: '#D9531A', unite: 'm³' };
  if (/electri/.test(t)) return { icon: 'bolt', court: 'Électricité', teinte: '#A16207', unite: 'kWh' };
  if (/appoint/.test(t)) return { icon: 'drop', court: 'Appoint chauffage', teinte: '#1D6FB8', unite: 'm³' };
  if (/\bef\b|eau froide/.test(t)) return { icon: 'drop', court: /ecs/.test(t) ? 'Eau froide ECS' : 'Eau froide', teinte: '#1D6FB8', unite: 'm³' };
  if (/energie|calorie|mwh|kwh/.test(t)) return { icon: 'flash', court: /ecs/.test(t) ? 'Énergie ECS' : /chauffage/.test(t) ? 'Énergie chauffage' : 'Énergie', teinte: '#B42318', unite: 'MWh' };
  if (/volum|eau/.test(t)) return { icon: 'drop', court: 'Eau', teinte: '#1D6FB8', unite: 'm³' };
  return { icon: 'meter', court: null, teinte: '#475467', unite: null };
}

// Températures et pH : circuit (Primaire, Chauffage, ECS) + sens (départ,
// retour, stockage).
export function pictoTemperature(label) {
  const t = norm(label);
  if (/^\s*ph\b/.test(t)) return { circuit: 'Eau', circuitIcon: 'ph', sens: 'pH', sensIcon: 'ph', teinte: '#6941C6', unite: '' };
  const circuit = /primaire/.test(t) ? 'Primaire' : /sanitaire|ecs/.test(t) ? 'ECS' : /chauffage/.test(t) ? 'Chauffage' : /exterieur/.test(t) ? 'Extérieur' : null;
  const circuitIcon = circuit === 'ECS' ? 'drop' : circuit === 'Primaire' ? 'flame' : 'temperature';
  const sens = /depart/.test(t) ? 'Départ' : /retour/.test(t) ? 'Retour' : /stockage/.test(t) ? 'Stockage' : null;
  const sensIcon = sens === 'Départ' ? 'arrow-out' : sens === 'Retour' ? 'arrow-in' : sens === 'Stockage' ? 'tank' : 'temperature';
  const teinte = sens === 'Départ' ? '#C2410C' : sens === 'Retour' ? '#1D6FB8' : '#6941C6';
  return { circuit, circuitIcon, sens, sensIcon, teinte, unite: '°C' };
}
