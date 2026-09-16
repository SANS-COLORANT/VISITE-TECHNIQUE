from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Visit pager: a tab tap must always recover from an interrupted horizontal swipe
# ---------------------------------------------------------------------------
p = Path('VisiteScreen.js')
s = p.read_text(encoding='utf-8')
old = """  const changerOnglet = useCallback((prochain, anime = true) => {\n    if (!prochain || prochain === activeTabRef.current || transitionRef.current) return;\n    Keyboard.dismiss();\n"""
new = """  const interrompreTransitionOnglet = useCallback(() => {\n    // Un swipe interrompu (FlatList, ScrollView horizontal, slider de criticité...)\n    // ne doit jamais laisser transitionRef verrouillé. Un tap explicite sur un\n    // onglet est prioritaire et remet le pager dans un état navigable.\n    pagerX.stopAnimation();\n    preAllumageLocalX.stopAnimation();\n    preAllumageLocalX.setValue(0);\n    transitionRef.current = false;\n  }, [pagerX, preAllumageLocalX]);\n\n  const changerOnglet = useCallback((prochain, anime = true) => {\n    if (!prochain) return;\n    interrompreTransitionOnglet();\n    if (prochain === activeTabRef.current) {\n      const currentIndex = tabOrderRef.current.indexOf(prochain);\n      if (currentIndex >= 0) pagerX.setValue(-currentIndex * pagerWidthRef.current);\n      return;\n    }\n    Keyboard.dismiss();\n"""
s = replace_once(s, old, new, 'pager recovery handler')
s = replace_once(
    s,
    "  }, [addMountedPanels, animateToTab, completeTabChange, pagerX]);\n\n  const retourSecurise",
    "  }, [addMountedPanels, animateToTab, completeTabChange, pagerX, interrompreTransitionOnglet]);\n\n  const retourSecurise",
    'pager callback dependencies',
)
s = replace_once(
    s,
    "      onPanResponderTerminationRequest: () => false,\n",
    "      // Autoriser les contrôles enfants (slider, listes horizontales...) à\n      // reprendre la main. onPanResponderTerminate remet déjà le pager à zéro.\n      onPanResponderTerminationRequest: () => true,\n",
    'pager responder termination',
)
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# Intranet visit payload: partial field completion must not block a valid visit
# ---------------------------------------------------------------------------
p = Path('intranetVisitPayload.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "export const INTRANET_MATERIAL_STATES = Object.freeze(['Hors service', 'Vétuste', 'Moyen', 'Bon', 'Neuf']);\n",
    "export const INTRANET_MATERIAL_STATES = Object.freeze(['Hors service', 'Vétuste', 'Moyen', 'Bon', 'Neuf']);\n// Le serveur exige une branche pour chaque critère de la trame. Une conformité\n// laissée volontairement vide dans METRA est donc envoyée comme Non vérifié\n// plutôt que de bloquer toute la visite ou de prétendre qu'elle est satisfaite.\nexport const INTRANET_UNANSWERED_AVIS = 'N.V';\n",
    'partial visit default avis',
)
old = """        if (column) {\n          if (network) commentaire = exactComment(network[column], issues, `${path} / commentaire`);\n          if (applicable) issues.push(`${path} : critère réseau déclaré avec avis, mapping non supporté sans ambiguïté.`);\n        } else if (!candidate) {\n          issues.push(`${path} : aucun champ METRA correspondant de façon sûre.`);\n        } else if (applicable) {\n          const control = controlMap.get(`${candidate.sectionCode}||${candidate.cle}`);\n          const currentAvis = nullable(control?.avis);\n          if (!INTRANET_AVIS.includes(currentAvis)) issues.push(`${path} : avis obligatoire (${INTRANET_AVIS.join(', ')}).`);\n          else avis = currentAvis;\n          commentaire = exactComment(control?.commentaire, issues, `${path} / commentaire`);\n        } else {\n          let value;\n          if (visite.trame_id === 'icpe_v1' && candidate.panelId === 'p-releves' && /^index\\b/.test(normalize(candidate.label))) {\n            value = counterValue(counters, criterion, candidate);\n            if (value === undefined) issues.push(`${path} : compteur correspondant introuvable ou ambigu.`);\n          } else value = fieldMap.get(`${candidate.sectionCode}||${candidate.cle}`);\n          commentaire = exactComment(value, issues, `${path} / commentaire`);\n        }\n"""
new = """        if (column) {\n          if (network) commentaire = exactComment(network[column], issues, `${path} / commentaire`);\n          // Une branche réseau laissée vide reste une branche valide du POST.\n          // Si elle porte exceptionnellement un avis, N.V exprime fidèlement\n          // l'absence de contrôle sans inventer une conformité.\n          if (applicable) avis = INTRANET_UNANSWERED_AVIS;\n        } else if (!candidate) {\n          // La structure distante reste exhaustive, mais une absence de champ\n          // METRA équivalent ne doit plus rendre toute la visite non envoyable.\n          avis = applicable ? INTRANET_UNANSWERED_AVIS : null;\n          commentaire = '/';\n        } else if (applicable) {\n          const control = controlMap.get(`${candidate.sectionCode}||${candidate.cle}`);\n          const currentAvis = nullable(control?.avis);\n          avis = INTRANET_AVIS.includes(currentAvis) ? currentAvis : INTRANET_UNANSWERED_AVIS;\n          commentaire = exactComment(control?.commentaire, issues, `${path} / commentaire`);\n        } else {\n          let value;\n          if (visite.trame_id === 'icpe_v1' && candidate.panelId === 'p-releves' && /^index\\b/.test(normalize(candidate.label))) {\n            // Un compteur non relevé est une donnée manquante, pas une erreur de\n            // structure. '/' est le marqueur métier accepté par l'Intranet.\n            value = counterValue(counters, criterion, candidate);\n          } else value = fieldMap.get(`${candidate.sectionCode}||${candidate.cle}`);\n          commentaire = exactComment(value, issues, `${path} / commentaire`);\n        }\n"""
s = replace_once(s, old, new, 'partial visit criteria mapping')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# Regression contract: preserve structural identity but allow empty business data
# ---------------------------------------------------------------------------
p = Path('.github/scripts/check_partial_intranet_visit_contract.js')
p.write_text(r'''const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) { if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`); }
function forbidText(text, needle, label) { if (text.includes(needle)) throw new Error(`${label}: forbidden ${needle}`); }

const payload = read('intranetVisitPayload.js');
requireText(payload, "INTRANET_UNANSWERED_AVIS = 'N.V'", 'blank conformity neutral value');
requireText(payload, "avis = INTRANET_AVIS.includes(currentAvis) ? currentAvis : INTRANET_UNANSWERED_AVIS", 'blank conformity is non-blocking');
requireText(payload, "commentaire = '/'", 'unmapped or empty technical value placeholder');
forbidText(payload, 'avis obligatoire (', 'blank conformity must not block visit upload');
forbidText(payload, 'compteur correspondant introuvable ou ambigu', 'missing counter must not block visit upload');
requireText(payload, 'countRemoteCriteria', 'all remote criteria still emitted');
requireText(payload, 'seenRemoteBranches', 'duplicate remote branches still blocked');
requireText(payload, 'apiId(category?.id', 'remote category identity stays ID-based');
requireText(payload, 'apiId(subCategory?.id', 'remote subcategory identity stays ID-based');
requireText(payload, 'apiId(criterion?.id', 'remote criterion identity stays ID-based');
requireText(payload, 'destructiveMaterialChange', 'material replacement safety retained');

const binding = read('intranetVisitBindingDb.js');
requireText(binding, 'remote_local_id', 'remote local target remains ID-based');
requireText(binding, 'remote_site_id', 'remote site target remains ID-based');
requireText(binding, 'wrong_imported_site', 'cross-site safety retained');
requireText(binding, 'imported_local_ambiguous', 'ambiguous local is never guessed by name/date');

const screen = read('VisiteScreen.js');
requireText(screen, 'interrompreTransitionOnglet', 'tab tap recovery');
requireText(screen, 'pagerX.stopAnimation()', 'stale pager animation cancellation');
requireText(screen, 'preAllumageLocalX.stopAnimation()', 'nested local animation cancellation');
requireText(screen, 'onPanResponderTerminationRequest: () => true', 'nested horizontal controls may terminate pager gesture');
forbidText(screen, 'prochain === activeTabRef.current || transitionRef.current', 'transition lock cannot disable tab taps');

console.log('Partial Intranet visit + tab swipe contract validated: empty measures/counters/conformities remain sendable with neutral placeholders, structural IDs stay strict, and tab taps recover from interrupted swipes.');
''', encoding='utf-8')

p = Path('.github/scripts/run_source_patches.js')
s = p.read_text(encoding='utf-8')
marker = "  ['Intranet visit upload contract', '.github/scripts/check_intranet_visit_upload_contract.js'],\n"
line = "  ['partial Intranet visit + tab swipe contract', '.github/scripts/check_partial_intranet_visit_contract.js'],\n"
if line not in s:
    if marker not in s:
        raise SystemExit('run_source_patches marker not found')
    s = s.replace(marker, marker + line, 1)
p.write_text(s, encoding='utf-8')

print('METRA partial Intranet visit + tab swipe fix applied.')
