const fs = require('fs');
function read(path) {
  return fs.readFileSync(path, 'utf8');
}
// Compare en ignorant les espaces/retours à la ligne : le contrôle vérifie une
// structure de code, pas un formatage exact (survit à un passage Prettier).
function norm(s) {
  return s.replace(/\s+/g, '');
}
function need(text, value, label) {
  if (!norm(text).includes(norm(value))) throw new Error('[camera-runtime] ' + label + ': missing ' + value);
}
function forbid(text, value, label) {
  if (norm(text).includes(norm(value))) throw new Error('[camera-runtime] ' + label + ': forbidden ' + value);
}

const camera = read('cameraRuntime.js');
const button = read('PhotoButton.js');
const gallery = read('OptimizedPhotoPanel.js');
const context = read('photoCaptureContext.js');
const runtime = read('photoRuntimeCache.js');
const companion = read('CompanionPhoneScreen.js');
const outbox = read('companionOutbox.js');
const prewarm = read('visitPrewarm.js');
const preallumage = read('PreAllumagePhotoButton.js');
const patrimoineStorage = read('patrimoineImageStorage.js');
const patrimoineCard = read('PatrimoineImageCard.js');
const docs = read('docs/PERFORMANCE_RUNTIME.md');

need(camera, 'getCameraPermissionsAsync', 'permission must be checked without prompting during prewarm');
need(camera, 'if (launchPromise) return launchPromise', 'double taps must not open two native cameras');
forbid(button, 'requestCameraPermissionsAsync()', 'visit capture must not request permission on every shot');
need(button, 'onPressIn={() => { prechaufferCapture().catch(() => {}); }}', 'photo button must prewarm on touch-down');
need(button, 'createReserve: false', 'speculative prewarm must remain side-effect free');
need(button, 'photo-pending:', 'new shot must appear optimistically');
need(button, 'replaceRuntimePhoto(visiteId, tempId', 'optimistic shot must be replaced by durable row');
need(button, 'journaliserPhotoEnAttente', 'durability journal must remain');
need(button, 'prewarmPhotoCaptureContext(visiteId)', 'visit photo directory must be warmed');
need(context, 'new BoundedLruMap(3)', 'capture context cache must stay bounded');
need(runtime, 'const cache = new BoundedLruMap(3);', 'photo index must stay bounded to hot visits');
need(runtime, 'all.slice(0, 24)', 'thumbnail prewarm must stay bounded');
need(runtime, 'all.slice(0, 4)', 'preview prewarm must stay bounded');

need(gallery, 'setCameraEnCours(false)', 'gallery camera lock must end immediately after native camera returns');
need(gallery, 'void (async () => {', 'gallery persistence must continue behind the UI');
need(gallery, "variant={photo.pending ? 'original' : 'thumb'}", 'pending gallery shot must display immediately');
need(preallumage, 'photoRuntimeCache.js', 'Pre-allumage thumbnail must use the shared visit photo index');

need(companion, 'setBusyTarget(null)', 'companion target must unlock after camera return');
need(companion, 'Photo capturée · classement', 'companion must acknowledge the shutter before transfer completes');
need(outbox, 'let mutationQueue = Promise.resolve();', 'rapid companion captures must serialize queue mutations');
need(outbox, 'serialiseMutation', 'companion outbox must remain race-safe');

need(prewarm, 'prewarmCameraRuntime().catch(() => {})', 'visit prewarm must warm camera runtime');
need(prewarm, 'prewarmPhotoCaptureContext(id).catch(() => {})', 'visit prewarm must warm durable photo folder');
need(prewarm, 'loadVisitPhotos(id).catch(() => {})', 'visit prewarm must warm photo index');

need(patrimoineStorage, 'launchMetraCamera', 'patrimoine camera must reuse warm runtime');
need(patrimoineStorage, 'onCaptured?.(asset.uri)', 'patrimoine must expose immediate captured image');
need(patrimoineCard, 'onCaptured: (tempUri)', 'patrimoine UI must show capture before compression finishes');

need(docs, '## Appareil photo instantané', 'instant camera architecture must be documented');
need(
  docs,
  'Un simple `onPressIn` ne doit jamais créer une réserve',
  'side-effect-free prewarm rule must be documented'
);

console.log('[camera-runtime] OK');
