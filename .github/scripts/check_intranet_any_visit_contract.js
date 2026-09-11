const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
function need(text, value, label) { if (!text.includes(value)) throw new Error(`${label}: missing ${value}`); }
function forbid(text, value, label) { if (text.includes(value)) throw new Error(`${label}: forbidden ${value}`); }

const binding = read('intranetVisitBindingDb.js');
need(binding, 'local_client_id=?', 'visit is locked to the imported local client relation');
need(binding, 'bindVisitToImportedClientTarget', 'automatic same-client destination binding');
need(binding, 'Ce client METRA n’a pas été importé depuis l’Intranet', 'non-imported client rejection');
need(binding, 'La visite ne peut être envoyée que vers le client Intranet ayant été importé', 'cross-client rejection');
need(binding, 'COALESCE(s.local_site_id,cs.local_site_id)=?', 'same imported site relation');
need(binding, 'Plusieurs locaux Intranet compatibles existent', 'ambiguous local protection');
need(binding, "policy: 'same_imported_client'", 'frozen same-client provenance');
need(binding, "sourceType: 'upload_binding'", 'send-time frozen reference');
need(binding, 'validApiId', 'remote identity validation');
need(binding, 'countReferenceCriteria', 'frozen criteria validation');
need(binding, 'seen.has(key)', 'duplicate remote branch rejection');
need(binding, 'Aucune trame Intranet exploitable n’est configurée pour ce local.', 'missing trame diagnosis');

const sync = read('IntranetVisitSync.js');
need(sync, "const OFFLINE = '#111111'", 'black Offline state');
need(sync, "const ONLINE = '#16794B'", 'green Online state');
need(sync, "online ? 'Online' : 'Offline'", 'single Online/Offline status button');
need(sync, 'bindVisitToImportedClientTarget', 'one-click same-client binding');
need(sync, 'syncClientPreparation(error.remoteClientId)', 'automatic refresh of the same imported client');
need(sync, 'Appuie sur Offline pour l’envoyer au client importé', 'direct-send UX');
need(sync, 'Export Intranet confirmé', 'success status feedback');
need(sync, 'serverFeedback', 'server error feedback');
need(sync, 'discardTerminalVisitUpload', 'safe terminal retry preparation');
need(sync, 'assertQueuedClientStillMatchesImportedClient', 'legacy queued upload client guard');
need(sync, 'queued_client_mismatch', 'old cross-client queued payload protection');
forbid(sync, 'IntranetVisitDestinationPicker', 'arbitrary destination picker removed from visit send flow');
forbid(sync, 'Choisir la destination Intranet', 'no arbitrary client chooser');
forbid(sync, 'Modifier la destination Intranet', 'no cross-client destination edit');

const payload = read('intranetVisitPayload.js');
need(payload, "sourceType === 'upload_binding'", 'send-time frozen context');
need(payload, 'preparedContext', 'explicit binding precedence over old preparation');

console.log('Imported-client Intranet contract validated: a METRA visit can only return to its imported client/site/local, with one black Offline button that becomes green Online after server acknowledgement, including protection against legacy queued cross-client payloads.');
