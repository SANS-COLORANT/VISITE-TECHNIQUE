from pathlib import Path

p = Path('intranetVisitPayload.js')
s = p.read_text(encoding='utf-8')
old_fn = """function counterValue(counters, criterion, candidate) {
  const keys = new Set([cleanCounterLabel(criterion?.nom), cleanCounterLabel(candidate?.label), cleanCounterLabel(candidate?.cle)].filter(Boolean));
  const exact = counters.filter((counter) => keys.has(cleanCounterLabel(counter.label)));
  if (exact.length === 1) return exact[0].valeur;
  return undefined;
}
"""
new_fn = """function counterValue(counters, criterion, candidate) {
  const keys = new Set([cleanCounterLabel(criterion?.nom), cleanCounterLabel(candidate?.label), cleanCounterLabel(candidate?.cle)].filter(Boolean));
  const exact = counters.filter((counter) => keys.has(cleanCounterLabel(counter.label)));
  if (exact.length === 1) return { value: exact[0].valeur, ambiguous: false };
  // Aucun compteur renseigné est un cas métier valide : exactComment(undefined)
  // l'enverra sous forme de « / ». Plusieurs correspondances restent bloquantes.
  return { value: undefined, ambiguous: exact.length > 1 };
}
"""
if new_fn not in s:
    if old_fn not in s:
        raise SystemExit('counterValue marker not found')
    s = s.replace(old_fn, new_fn, 1)
old_call = """            // Un compteur non relevé est une donnée manquante, pas une erreur de
            // structure. '/' est le marqueur métier accepté par l'Intranet.
            value = counterValue(counters, criterion, candidate);
"""
new_call = """            const counter = counterValue(counters, criterion, candidate);
            value = counter.value;
            if (counter.ambiguous) issues.push(`${path} : plusieurs compteurs locaux correspondent à ce critère.`);
"""
if new_call not in s:
    if old_call not in s:
        raise SystemExit('counter call marker not found')
    s = s.replace(old_call, new_call, 1)
p.write_text(s, encoding='utf-8')
print('Partial counter alignment applied.')
