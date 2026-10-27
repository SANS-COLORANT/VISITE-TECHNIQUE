/** Safety contracts: private free photos, editable captions and REMAR multiline meters. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = (file) => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
let checked = 0;
function ok(condition, description) { assert.ok(condition, description); console.log('OK ' + ++checked + ': ' + description); }

const photoPolicy = source('photoPublicationDb.js');
const free = new Function(
  photoPolicy.replace(/^import.*$/gm, '').replace(/\bexport\s+/g, '') +
  '\nreturn { isFreePhoto, canPublishPhoto };'
)();
ok(free.isFreePhoto({ entite_key: null }), 'unattached photos are free');
ok(!free.isFreePhoto({ entite_key: 'remarque||id' }), 'reserve photos are not free');
ok(!free.canPublishPhoto({ entite_key: null }), 'free photo is local by default');
ok(free.canPublishPhoto({ entite_key: null, included: 1 }), 'free photo can be opted in');
ok(!free.canPublishPhoto({ entite_key: null, included: 0 }), 'free photo can be excluded again');
ok(free.canPublishPhoto({ entite_key: 'compteur||id' }), 'linked photo keeps historical inclusion');
ok(photoPolicy.includes('photo_publication') && photoPolicy.includes('CREATE TABLE IF NOT EXISTS'),
  'non-destructive local publishing metadata');
ok(photoPolicy.includes("String(photo.label || '').split('||').slice(1).join('||')"),
  'renaming preserves the immutable underlying filename');
ok(photoPolicy.includes("UPDATE photos SET label=? WHERE id=?"),
  'photo caption is saved in existing photo database field');
ok(photoPolicy.includes("UPDATE api_visit_photo_outbox SET description=?"),
  'pending Intranet photo description follows renamed caption');
ok(photoPolicy.includes("status IN ('pending','retry','auth_error','validation_error','rejected')"),
  'opt-out cancels only unsent photo transfers');

const panel = source('OptimizedPhotoPanel.js');
ok(panel.includes("setPhotoPublication(viewerPhoto.id, !included)"), 'explicit per-photo opt-in action');
ok(panel.includes('renameVisitPhoto(viewerPhoto.id, labelDraft)'), 'photo viewer allows renaming');
ok(panel.includes("label: 'Photo libre'"), 'new free photos carry their own category label');
ok(panel.includes('Locale uniquement') && panel.includes('Intégranet') === false, 'photo privacy shown to user');

const outbox = source('intranetVisitPhotoOutboxDb.js');
ok(outbox.includes('if (!publication.get(String(photo.id))) continue'), 'free photo never enters normal upload queue');
ok(outbox.includes('if (allowedByVisit.get(row.visite_id).get(String(row.photo_id))) eligible.push(row)'),
  'historical queued private photos are filtered again before upload');
const report = source('reportBuilder.js');
ok(report.includes("listPhotoPublication(visiteId)"), 'photo publication consulted at report preparation');
ok(report.includes('Boolean(data.photoPublication?.get(String(p.id)))'), 'local-only photos omitted from report');
ok(report.includes("String(photo.label || '').split('||')[0]"), 'report uses the editable photo caption');
const screen = source('VisiteScreen.js');
ok(screen.includes('photoLabel="Photo libre"') && !screen.includes('<PhotoPhoneScreen'),
  'Mode Photo replaced without removing the Photos tab');
const meter = source('DurableChampGenerique.js');
const generics = source('TrameGenericPanel.js');
ok(meter.includes('multipleCounters = false') && meter.includes('field.numericIndex && multipleCounters'),
  'multiline meter UI is opt-in only');
ok(meter.includes('+ Ajouter un compteur') && meter.includes('multiline'), 'technician can add more meter lines');
ok(generics.includes("multipleCounters={estRemar && panelId === 'p-remar-releves' && item.field.numericIndex === true}"),
  'only REMAR index fields use multiline meter UI');
ok(!source('releveMultiligne.js').includes('photo_publication'), 'historic meter serialization is not altered');
console.log('\n' + checked + ' safety checks passed.');
