from pathlib import Path

p = Path('excelImport.js')
s = p.read_text(encoding='utf-8')

old = """  const dateDetectee = lireMetadonnee(principale, meta.dateVisite, 'dateVisite');

  return {
"""
new = """  const dateDetecteeBrute = lireMetadonnee(principale, meta.dateVisite, 'dateVisite');
  const dateParasite = new Set(['de la visite', 'de la date', 'la visite', 'la date', 'date', 'date de visite', 'date visite']);
  const dateDetectee = dateParasite.has(normaliserTexte(dateDetecteeBrute)) ? '' : dateDetecteeBrute;

  return {
"""
if old not in s:
    if "const dateParasite = new Set(['de la visite'" not in s:
        raise SystemExit('Target date block not found')
else:
    s = s.replace(old, new, 1)

old_return = "    dateVisite: dateDetectee || new Date().toISOString().slice(0, 10),"
new_return = "    dateVisite: dateDetectee,"
if old_return in s:
    s = s.replace(old_return, new_return, 1)
elif new_return not in s:
    raise SystemExit('Target date return not found')

p.write_text(s, encoding='utf-8')
print('Excel import date sanitized without changing the working import flow.')
