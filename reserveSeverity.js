export const RESERVE_SEVERITY_LEVELS = Object.freeze([
  { value: 1, key: 'minor', label: 'Mineur', short: 'Mineur' },
  { value: 2, key: 'treat', label: 'À traiter', short: 'À traiter' },
  { value: 3, key: 'important', label: 'Important', short: 'Important' },
  { value: 4, key: 'critical', label: 'Critique', short: 'Critique' },
]);

export function clampReserveSeverity(value, fallback = 2) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(1, Math.min(4, n)) : fallback;
}

export function reserveSeverityLabel(value) {
  const n = clampReserveSeverity(value);
  return RESERVE_SEVERITY_LEVELS.find((level) => level.value === n)?.label || 'À traiter';
}

export function defaultSeverityForControl(field = {}, preset = null) {
  const explicit = preset?.criticite ?? preset?.severity ?? field?.criticiteDefaut ?? field?.severityDefault;
  if (explicit !== undefined && explicit !== null) return clampReserveSeverity(explicit);
  const text = `${field?.cle || ''} ${preset?.label || ''} ${preset?.commentaire || ''} ${preset?.reserve || ''}`.toLowerCase();
  if (/garde-corps|ligne de vie|chute|danger|sécur|secur|électri|electri|gaz|incendie|co\b|monoxyde/.test(text)) return 4;
  if (/accès|acces|manchette|fuite|étanch|etanch|dégrad|degrad|fonctionnement|panne/.test(text)) return 3;
  return 2;
}
