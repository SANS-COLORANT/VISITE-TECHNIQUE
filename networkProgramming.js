/**
 * Programme et courbe de chauffe structurés, sans changer le schéma 48.
 * Ces données complètent les anciens champs pente/T°/programme texte et
 * restent indépendantes des trames ICPE, RCU ou REMAR.
 */
export const NETWORK_POINTS_KEY = 'regulation.courbe_points_v1';
export const NETWORK_SCHEDULE_KEY = 'regulation.programme_hebdomadaire_v1';
export const WEEK_DAYS = Object.freeze(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);

function txt(v) { return String(v == null ? '' : v).trim(); }
function validTemp(value, min, max) {
  const raw = txt(value);
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(raw)) return false;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max;
}
function isTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(txt(v));
  return Boolean(m && Number(m[1]) <= 23 && Number(m[2]) <= 59);
}
export function parseNetworkPoints(raw) {
  let input = raw;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return []; } }
  if (!Array.isArray(input)) return [];
  return input.slice(0, 48).map((r) => ({ ext: txt(r?.ext), dep: txt(r?.dep) }));
}
export function validateNetworkPoints(raw) {
  const points = parseNetworkPoints(raw);
  const used = new Set();
  for (const p of points) {
    if (!validTemp(p.ext, -60, 60) || !validTemp(p.dep, -10, 150)) {
      throw new Error('Chaque point exige un couple de températures numérique valide (T° ext. et T° départ).');
    }
    const key = String(Number(p.ext.replace(',', '.')));
    if (used.has(key)) throw new Error('Deux points ne peuvent pas avoir la même température extérieure.');
    used.add(key);
  }
  return points;
}
export function pointsFromLegacy(ext, dep) {
  const exts = txt(ext).split(/\r?\n|\s*\|\s*/).map(txt).filter(Boolean);
  const deps = txt(dep).split(/\r?\n|\s*\|\s*/).map(txt).filter(Boolean);
  if (exts.length < 2 || exts.length !== deps.length) return [];
  try { return validateNetworkPoints(exts.map((t,i)=>({ext:t,dep:deps[i]}))); }
  catch { return []; }
}
export function networkTemperatureSeries(points) {
  const checked = validateNetworkPoints(points);
  return { ext: checked.map(p=>p.ext).join('\n'), dep: checked.map(p=>p.dep).join('\n') };
}
export function emptyWeeklySchedule() {
  return { allDays: false, days: Object.fromEntries(WEEK_DAYS.map(d => [d, []])) };
}
export function parseWeeklySchedule(raw) {
  let input = raw;
  if (typeof raw === 'string') { try { input = JSON.parse(raw); } catch { input = null; } }
  const result = emptyWeeklySchedule();
  if (!input || typeof input !== 'object') return result;
  result.allDays = input.allDays === true;
  for (const day of WEEK_DAYS) {
    result.days[day] = (Array.isArray(input.days?.[day]) ? input.days[day] : [])
      .slice(0, 12).map(p=>({
        start: txt(p?.start), end: txt(p?.end),
        comfort: txt(p?.comfort), reduced: txt(p?.reduced),
      }));
  }
  return result;
}
export function validateWeeklySchedule(raw) {
  const schedule = parseWeeklySchedule(raw);
  for (const day of schedule.allDays ? [WEEK_DAYS[0]] : WEEK_DAYS) {
    const periods = schedule.days[day];
    for (const period of periods) {
      if (!isTime(period.start) || !isTime(period.end) || period.start >= period.end)
        throw new Error('Programme : les heures doivent être HH:MM, avec un début antérieur à la fin.');
      if (!validTemp(period.comfort, -10, 50) || !validTemp(period.reduced, -10, 50))
        throw new Error('Programme : les consignes Confort et Réduit doivent être numériques.');
    }
    const ordered = [...periods].sort((a,b)=>a.start.localeCompare(b.start));
    for (let i=1;i<ordered.length;i++) if (ordered[i].start < ordered[i-1].end)
      throw new Error('Programme : les plages d’une même journée ne peuvent pas se chevaucher.');
  }
  if (schedule.allDays) for (const day of WEEK_DAYS.slice(1))
    schedule.days[day] = schedule.days[WEEK_DAYS[0]].map(p=>({...p}));
  return schedule;
}
export function formatWeeklySchedule(raw) {
  const s = validateWeeklySchedule(raw);
  const days = s.allDays ? [WEEK_DAYS[0]] : WEEK_DAYS;
  const lines = [];
  for(const day of days) for(const p of s.days[day])
    lines.push((s.allDays ? 'Tous les jours' : day) + ' ' + p.start + '-' + p.end +
      ' · Confort ' + p.comfort + ' °C / Réduit ' + p.reduced + ' °C');
  return lines.join('\n');
}
