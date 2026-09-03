export const RESERVE_SEVERITY_LEVELS = Object.freeze([
  { value: 0, key: 'info', label: 'Information', short: 'Info' },
  { value: 1, key: 'minor', label: 'Mineur', short: 'Mineur' },
  { value: 2, key: 'planned', label: 'À programmer', short: 'À programmer' },
  { value: 3, key: 'important', label: 'Important', short: 'Important' },
  { value: 4, key: 'priority', label: 'Prioritaire', short: 'Prioritaire' },
  { value: 5, key: 'critical', label: 'Critique', short: 'Critique' },
]);

export function clampReserveSeverity(value, fallback = 2) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : fallback;
}

export function reserveSeverityLabel(value) {
  const n = clampReserveSeverity(value);
  return RESERVE_SEVERITY_LEVELS.find((level) => level.value === n)?.label || 'À programmer';
}

export function defaultSeverityForControl(field = {}, preset = null) {
  const explicit = preset?.criticite ?? preset?.severity ?? field?.criticiteDefaut ?? field?.severityDefault;
  if (explicit !== undefined && explicit !== null) return clampReserveSeverity(explicit);

  const text = `${field?.cle || ''} ${preset?.label || ''} ${preset?.commentaire || ''} ${preset?.reserve || ''}`.toLowerCase();

  // 5 - critique : risque immédiat pour les personnes, sécurité incendie/gaz/électricité.
  if (/absence de garde-corps|garde-corps absent|ligne de vie absente|risque de chute|chute de hauteur|danger immédiat|électrocution|electrocution|fuite de gaz|incendie|monoxyde|co\b/.test(text)) return 5;

  // 4 - prioritaire : accès dangereux ou défaut de sécurité important sans danger immédiat explicite.
  if (/accès dangereux|acces dangereux|accès difficile|acces difficile|sécur|secur|garde-corps|ligne de vie|trappe dangereuse|skydome|échelle non adaptée|echelle non adaptee/.test(text)) return 4;

  // 3 - important : panne, fuite, défaut de fonctionnement ou dégradation technique notable.
  if (/panne|ne fonctionne pas|hors service|fuite|défaut de fonctionnement|defaut de fonctionnement|fortement dégrad|fortement degrad|corrosion importante|vibration importante/.test(text)) return 3;

  // 2 - à programmer : défaut courant nécessitant une action, typiquement manchette/étanchéité/usure.
  if (/manchette|étanch|etanch|dégrad|degrad|usure|nettoyage|encrass|fixation|supportage|isolant/.test(text)) return 2;

  // 1 - mineur : observation faible sans impact technique immédiat.
  if (/léger|leger|mineur|esthétique|esthetique|repérage|reperage|étiquette|etiquette/.test(text)) return 1;

  return 2;
}
