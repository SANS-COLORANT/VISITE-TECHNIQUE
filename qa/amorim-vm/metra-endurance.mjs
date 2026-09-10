import { remote } from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = Number(process.env.APPIUM_PORT || 4723);
const DEVICE = process.env.DEVICE_NAME || 'emulator-5554';
const PACKAGE = process.env.APP_PACKAGE || 'com.sanscolorant.visitetechnique';
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS || 12000);
const MAX_RUNTIME_MIN = Number(process.env.MAX_RUNTIME_MIN || 240);
const STUCK_SECONDS = Number(process.env.STUCK_SECONDS || 25);
const MAX_RECOVERIES = Number(process.env.MAX_RECOVERIES || 120);
const ARTIFACT_ROOT = process.env.ARTIFACT_ROOT || path.resolve('qa/amorim-vm/artifacts');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_DIR = path.join(ARTIFACT_ROOT, RUN_ID);
fs.mkdirSync(RUN_DIR, { recursive: true });

const state = {
  startedAt: Date.now(), actions: 0, uniqueScreens: new Set(), transitions: 0,
  recoveries: 0, appRestarts: 0, sessionRestarts: 0, screenshots: 0,
  failures: [], coverage: {}, lastScreenHash: '', lastTransitionAt: Date.now(),
  checkpoints: [], events: []
};

function log(event, data = {}) {
  const row = { ts: new Date().toISOString(), event, ...data };
  state.events.push(row);
  process.stdout.write(JSON.stringify(row) + '\n');
}

function saveJson(name, value) {
  fs.writeFileSync(path.join(RUN_DIR, name), JSON.stringify(value, null, 2));
}

function hash(text) { return crypto.createHash('sha1').update(text || '').digest('hex'); }
function elapsedMin() { return (Date.now() - state.startedAt) / 60000; }
function bump(key) { state.coverage[key] = (state.coverage[key] || 0) + 1; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let driver;
async function startSession() {
  driver = await remote({ hostname: APPIUM_HOST, port: APPIUM_PORT, path: '/', logLevel: 'error',
    capabilities: {
      platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:deviceName': DEVICE,
      'appium:appPackage': PACKAGE, 'appium:noReset': true, 'appium:newCommandTimeout': 300,
      'appium:autoGrantPermissions': true, 'appium:disableWindowAnimation': true
    }
  });
}

async function source() {
  const s = await driver.getPageSource();
  const h = hash(s.replace(/bounds="[^"]+"/g, ''));
  if (state.lastScreenHash && h !== state.lastScreenHash) {
    state.transitions++;
    state.lastTransitionAt = Date.now();
  }
  state.lastScreenHash = h;
  state.uniqueScreens.add(h);
  return s;
}

async function dump(reason) {
  try { fs.writeFileSync(path.join(RUN_DIR, `${Date.now()}-${reason}.xml`), await driver.getPageSource()); } catch {}
  try { await driver.saveScreenshot(path.join(RUN_DIR, `${Date.now()}-${reason}.png`)); state.screenshots++; } catch {}
  try {
    const logs = await driver.getLogs('logcat');
    fs.writeFileSync(path.join(RUN_DIR, `${Date.now()}-${reason}-logcat.json`), JSON.stringify(logs.slice(-2500), null, 2));
  } catch {}
}

async function recover(reason) {
  state.recoveries++;
  log('watchdog_recovery', { reason, recoveries: state.recoveries });
  await dump(`watchdog-${state.recoveries}`);
  if (state.recoveries > MAX_RECOVERIES) throw new Error(`Too many recoveries: ${state.recoveries}`);
  for (let i = 0; i < 3; i++) {
    try { await driver.back(); await sleep(900); if ((await source()).length > 100) return; } catch {}
  }
  try {
    await driver.terminateApp(PACKAGE); await sleep(1200); await driver.activateApp(PACKAGE); await sleep(2500);
    state.appRestarts++; state.lastTransitionAt = Date.now(); return;
  } catch {}
  try { await driver.deleteSession(); } catch {}
  await startSession(); state.sessionRestarts++; state.lastTransitionAt = Date.now();
}

async function watchdog() {
  if ((Date.now() - state.lastTransitionAt) / 1000 > STUCK_SECONDS) await recover('screen_stuck');
  if (elapsedMin() > MAX_RUNTIME_MIN) throw new Error(`Runtime limit reached: ${MAX_RUNTIME_MIN} min`);
}

async function clickElement(el, label) {
  try {
    if (!(await el.isDisplayed())) return false;
    await el.click(); state.actions++; bump(label); await sleep(250); await source(); await watchdog(); return true;
  } catch (e) {
    state.failures.push({ action: label, error: String(e) }); return false;
  }
}

async function clickByText(text, key = `text:${text}`) {
  const safe = text.replace(/'/g, "\\'");
  const selectors = [
    `android=new UiSelector().text("${text.replace(/"/g, '\\"')}")`,
    `//*[@text='${safe}']`, `//*[@content-desc='${safe}']`, `//*[contains(@text,'${safe}') ]`
  ];
  for (const sel of selectors) {
    try { const el = await driver.$(sel); if (await el.isExisting()) return await clickElement(el, key); } catch {}
  }
  return false;
}

async function tapRandomClickable() {
  const els = await driver.$$('//*[@clickable="true" and @enabled="true"]');
  if (!els.length) return false;
  const pick = els[Math.floor(Math.random() * els.length)];
  return clickElement(pick, 'random_clickable');
}

async function fillVisibleInputs() {
  const inputs = await driver.$$('//android.widget.EditText');
  for (let i = 0; i < Math.min(inputs.length, 12); i++) {
    try {
      if (!(await inputs[i].isDisplayed())) continue;
      await inputs[i].click();
      await inputs[i].setValue(`TEST-AMORIM-${state.actions}-${i}`);
      state.actions++; bump('input_fill');
      try { await driver.hideKeyboard(); } catch {}
    } catch {}
  }
  await source();
}

async function swipe(direction = 'down') {
  const { width, height } = await driver.getWindowSize();
  const x = Math.floor(width * 0.5);
  const fromY = direction === 'down' ? Math.floor(height * 0.78) : Math.floor(height * 0.28);
  const toY = direction === 'down' ? Math.floor(height * 0.28) : Math.floor(height * 0.78);
  await driver.performActions([{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions: [
    { type: 'pointerMove', duration: 0, x, y: fromY }, { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 150 }, { type: 'pointerMove', duration: 450, x, y: toY }, { type: 'pointerUp', button: 0 }
  ] }]);
  await driver.releaseActions(); state.actions++; bump(`swipe_${direction}`); await sleep(250); await source();
}

const targets = [
  ['S', 'status_S'], ['N.S', 'status_NS'], ['N.R', 'status_NR'], ['S.O', 'status_SO'],
  ['Remarques', 'remarks'], ['Réserves', 'reserves'], ['Photos', 'photos'], ['Matériel', 'equipment'],
  ['Régulation', 'regulation'], ['Relevés', 'readings'], ['Rapport', 'report'], ['PDF', 'export_pdf'],
  ['Excel', 'export_excel'], ['Word', 'export_word'], ['VMC', 'vmc'], ['Pré-allumage', 'preallumage'],
  ['Patrimoine', 'patrimoine'], ['Documents', 'documents'], ['Sites', 'sites'], ['Visites', 'visites'],
  ['LAB', 'lab'], ['3D', 'lab3d'], ['Paramètres', 'settings'], ['Ajouter', 'add'], ['Enregistrer', 'save']
];

async function targetedSweep() {
  await source();
  for (const [text, key] of targets) {
    if (state.actions >= MAX_ACTIONS) break;
    const ok = await clickByText(text, key);
    if (ok) {
      await fillVisibleInputs();
      for (let i = 0; i < 3; i++) await swipe('down').catch(() => {});
      await driver.back().catch(() => {}); await sleep(300); await source();
    }
    await watchdog();
  }
}

async function longVisitPass(pass) {
  log('visit_pass_start', { pass });
  bump('visit_pass');
  await clickByText('Visites', 'visites');
  await clickByText('Ajouter', 'visit_add');
  await fillVisibleInputs();
  for (let section = 0; section < 18 && state.actions < MAX_ACTIONS; section++) {
    for (const [text, key] of targets.slice(0, 10)) await clickByText(text, key).catch(() => false);
    await fillVisibleInputs();
    await swipe(section % 2 ? 'up' : 'down').catch(() => {});
    for (let i = 0; i < 8; i++) await tapRandomClickable().catch(() => false);
    if (section % 3 === 0) {
      state.checkpoints.push({ ts: Date.now(), pass, section, actions: state.actions, screenHash: state.lastScreenHash });
      saveJson('checkpoints.json', state.checkpoints);
    }
    await watchdog();
  }
  await clickByText('Enregistrer', 'save');
  await driver.back().catch(() => {}); await sleep(500); await source();
  await clickByText('Visites', 'visites');
  bump('visit_reopen_attempt');
  await tapRandomClickable();
  await source();
  log('visit_pass_end', { pass, actions: state.actions });
}

async function chaosPhase() {
  log('chaos_start');
  while (state.actions < MAX_ACTIONS && elapsedMin() < MAX_RUNTIME_MIN) {
    const r = Math.random();
    if (r < 0.55) await tapRandomClickable();
    else if (r < 0.72) await swipe('down').catch(() => {});
    else if (r < 0.86) await swipe('up').catch(() => {});
    else if (r < 0.94) await fillVisibleInputs();
    else await driver.back().catch(() => {});
    await watchdog();
    if (state.actions % 250 === 0) {
      saveJson('live-report.json', report());
      log('progress', { actions: state.actions, transitions: state.transitions, uniqueScreens: state.uniqueScreens.size, recoveries: state.recoveries });
    }
  }
}

function report() {
  return {
    runId: RUN_ID, device: DEVICE, appPackage: PACKAGE,
    requestedMaxActions: MAX_ACTIONS, actions: state.actions, elapsedMinutes: Number(elapsedMin().toFixed(2)),
    transitions: state.transitions, uniqueScreens: state.uniqueScreens.size, recoveries: state.recoveries,
    appRestarts: state.appRestarts, sessionRestarts: state.sessionRestarts, screenshots: state.screenshots,
    coverage: state.coverage, failures: state.failures.slice(-500), checkpoints: state.checkpoints
  };
}

async function main() {
  try {
    await startSession();
    await source();
    await targetedSweep();
    let pass = 1;
    while (state.actions < Math.min(MAX_ACTIONS * 0.65, MAX_ACTIONS - 500)) {
      await longVisitPass(pass++);
      if (pass > 40) break;
    }
    await chaosPhase();
  } catch (e) {
    log('fatal', { error: String(e), stack: e?.stack });
    state.failures.push({ action: 'fatal', error: String(e) });
    await dump('fatal').catch(() => {});
  } finally {
    saveJson('final-report.json', report());
    saveJson('events.json', state.events);
    try { await driver?.deleteSession(); } catch {}
  }
  const r = report();
  console.log('\n=== METRA AMORIM VM ENDURANCE ===');
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.actions >= Math.min(3000, MAX_ACTIONS) ? 0 : 2);
}

main();
