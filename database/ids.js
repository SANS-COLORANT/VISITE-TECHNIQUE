let sequence = 0;

/**
 * Génère des identifiants opaques et centralisés sans dépendance native.
 * Le préfixe facilite le diagnostic sans porter de sens métier durable.
 */
export function createId(prefix = 'id') {
  sequence = (sequence + 1) % 1679616;
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  const suffix = sequence.toString(36).padStart(4, '0');
  return `${prefix}-${time}-${random}-${suffix}`;
}
