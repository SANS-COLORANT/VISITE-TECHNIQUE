const fs = require('fs');
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
requireText(payload, 'preservedSourceMaterials', 'empty material tab preserves frozen Intranet list');

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
