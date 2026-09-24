const scrollOffsets = new Map();

function keyOf(value) {
  return String(value || '').trim();
}

export function getNavigationScrollOffset(key) {
  const value = Number(scrollOffsets.get(keyOf(key)) || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function setNavigationScrollOffset(key, offset) {
  const id = keyOf(key);
  if (!id) return;
  const value = Number(offset || 0);
  scrollOffsets.set(id, Number.isFinite(value) && value > 0 ? value : 0);
}

export function forgetNavigationScrollOffset(key) {
  scrollOffsets.delete(keyOf(key));
}
