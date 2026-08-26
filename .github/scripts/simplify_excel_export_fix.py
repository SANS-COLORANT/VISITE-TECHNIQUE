from pathlib import Path

p = Path('excelExport.js')
s = p.read_text(encoding='utf-8')

old = '''  // Une visite issue d'un import Excel doit toujours repartir de SON fichier original.
  // On ne reconstruit jamais silencieusement une trame neuve si cette copie a disparu.
  if (details?.fichier || details?.sourceUri) {
    throw new Error('Le fichier Excel original importé est introuvable. Réimporte ce fichier pour garantir un export strictement fidèle.');
  }
  if (!cfg?.templateBase64) throw new Error('Aucune trame Excel source disponible pour cette visite.');
  return { sourceUri: null, sourceBase64: cfg.templateBase64, details, sourcePreservee: false };
'''

new = '''  // Si la copie locale historique n'est plus accessible, conserver le comportement
  // d'export existant : utiliser la trame disponible sans ajouter d'étape utilisateur.
  // Les patches ci-dessous restent limités aux seules cellules métier modifiées.
  if (!cfg?.templateBase64) throw new Error('Aucune trame Excel source disponible pour cette visite.');
  return { sourceUri: null, sourceBase64: cfg.templateBase64, details, sourcePreservee: false };
'''

if old not in s:
    if new in s:
        print('Minimal fallback already applied')
    else:
        raise SystemExit('Expected strict source guard not found')
else:
    s = s.replace(old, new, 1)
    p.write_text(s, encoding='utf-8')
    print('Minimal Excel export fallback restored')
