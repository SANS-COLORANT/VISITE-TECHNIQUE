const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
function need(text, value, label) { if (!text.includes(value)) throw new Error(`${label}: missing ${value}`); }
function forbid(text, value, label) { if (text.includes(value)) throw new Error(`${label}: forbidden ${value}`); }
const binding = read('intranetVisitBindingDb.js');
need(binding, "FROM api_client_links WHERE autorise=1", 'authorized client chooser');
need(binding, 'api_client_site_links', 'client/site relationship validation');
need(binding, 'remote_site_id=? AND remote_present=1', 'local/site relationship validation');
need(binding, "sourceType: 'upload_binding'", 'non-prefill send binding provenance');
need(binding, 'api_remote_client_id=?,api_remote_local_id=?,api_remote_trame_id=?', 'visit remote identity freeze');
need(binding, 'COALESCE(local_client_id,?)', 'future local-client association reuse');
need(binding, 'COALESCE(local_site_id,?)', 'future local-site association reuse');
const picker = read('IntranetVisitDestinationPicker.js');
need(picker, 'La visite peut avoir été créée normalement dans METRA', 'any-visit UX disclosure');
need(picker, 'syncAuthorizedClients()', 'client refresh');
need(picker, 'syncClientPreparation(clientId)', 'site/local refresh');
need(picker, 'Client Intranet', 'client chooser');
need(picker, 'Site Intranet', 'site chooser');
need(picker, 'Local / installation Intranet', 'local chooser');
const sync = read('IntranetVisitSync.js');
forbid(sync, "if (!visite?.api_remote_local_id || Number(visite?.api_is_historical) === 1) return null;", 'old prepared-only gate');
need(sync, 'Choisir la destination Intranet', 'unbound visit action');
need(sync, 'Modifier la destination Intranet', 'pre-send destination correction');
need(sync, 'Changer / actualiser la destination', 'safe terminal destination correction');
need(sync, 'discardTerminalVisitUpload', 'terminal outbox reset before rebinding');
need(sync, '<IntranetVisitDestinationPicker', 'destination picker wiring');
need(sync, 'Réponse Intranet HTTP 404', 'server client feedback');
need(sync, 'Réponse Intranet HTTP 422', 'server local/trame feedback');
const payload = read('intranetVisitPayload.js');
need(payload, "sourceType === 'upload_binding'", 'send-time frozen context');
need(payload, 'preparedContext', 'explicit binding precedence over older preparation');
need(binding, 'previousBindingIds', 'single current explicit destination provenance');
console.log('Any-visit Intranet binding contract validated: ordinary METRA visits can bind to an authorized client/site/local, refresh server preparation, then expose real server feedback.');
