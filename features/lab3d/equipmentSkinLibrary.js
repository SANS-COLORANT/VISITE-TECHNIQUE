const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const LAB3D_SKIN_LIBRARY = Object.freeze([
  { key: 'generic', label: 'Générique', brand: 'Générique', types: ['equipement','chaudiere','pompe','adoucisseur','ballon','vase_expansion','echangeur','bouteille','cta','vmc','ventilateur','armoire','bac_sel'], primary: '#7891A2', secondary: '#536977', accent: '#DCEAF1', dark: '#263845', variant: 'generic' },

  { key: 'viessmann-boiler', label: 'Viessmann · chaudière', brand: 'Viessmann', types: ['chaudiere'], primary: '#F2F2F0', secondary: '#DADBD8', accent: '#D71920', dark: '#4B4E50', variant: 'boiler_cabinet', modelHints: ['vitodens','vitocrossal','vitoplex'] },
  { key: 'dedietrich-boiler', label: 'De Dietrich · chaudière', brand: 'De Dietrich', types: ['chaudiere'], primary: '#E7E7E4', secondary: '#C9CAC8', accent: '#C9342E', dark: '#36383A', variant: 'boiler_floor', modelHints: ['c 230','c230','c 310','c310','c 340','c340','gas'] },
  { key: 'atlantic-boiler', label: 'Atlantic · chaudière', brand: 'Atlantic', types: ['chaudiere'], primary: '#F0F2F3', secondary: '#DDE3E6', accent: '#376C9B', dark: '#334653', variant: 'boiler_cabinet', modelHints: ['varfree','condensinox','varmax'] },
  { key: 'bosch-boiler', label: 'Bosch · chaudière', brand: 'Bosch', types: ['chaudiere'], primary: '#ECEEEE', secondary: '#D4D8D9', accent: '#C9342E', dark: '#42484B', variant: 'boiler_cabinet', modelHints: ['condens','uni'] },

  { key: 'grundfos-pump', label: 'Grundfos · pompe', brand: 'Grundfos', types: ['pompe'], primary: '#D13C33', secondary: '#5D6266', accent: '#F2F2EF', dark: '#22272B', variant: 'pump_inline', modelHints: ['magna','tpe','tp','alpha'] },
  { key: 'wilo-pump', label: 'Wilo · pompe', brand: 'Wilo', types: ['pompe'], primary: '#57A55A', secondary: '#3B4744', accent: '#E9F2E9', dark: '#222B29', variant: 'pump_inline', modelHints: ['stratos','yonos','vero'] },
  { key: 'ksb-pump', label: 'KSB · pompe', brand: 'KSB', types: ['pompe'], primary: '#3470A8', secondary: '#545C62', accent: '#EAF1F8', dark: '#202A33', variant: 'pump_inline', modelHints: ['etaline','etanorm','calio'] },
  { key: 'lowara-pump', label: 'Lowara · pompe', brand: 'Lowara', types: ['pompe'], primary: '#315D99', secondary: '#67717A', accent: '#F3F5F7', dark: '#29333B', variant: 'pump_inline', modelHints: ['ecocirc','e sh','e ns'] },

  { key: 'weishaupt-burner', label: 'Weishaupt · générateur', brand: 'Weishaupt', types: ['chaudiere','equipement'], primary: '#ECECEC', secondary: '#BBC1C4', accent: '#EA7D25', dark: '#33404A', variant: 'boiler_burner', modelHints: ['wm','wk','wg','wl'] },

  { key: 'danfoss-hydronic', label: 'Danfoss · hydraulique', brand: 'Danfoss', types: ['equipement','echangeur'], primary: '#D9DDE0', secondary: '#AEB6BC', accent: '#C52828', dark: '#30383E', variant: 'hydronic' },
  { key: 'siemens-cabinet', label: 'Siemens · armoire', brand: 'Siemens', types: ['armoire','equipement'], primary: '#D9DEDF', secondary: '#B9C0C2', accent: '#179B9B', dark: '#364246', variant: 'cabinet' },
  { key: 'schneider-cabinet', label: 'Schneider Electric · armoire', brand: 'Schneider Electric', types: ['armoire','equipement'], primary: '#D9DEDB', secondary: '#B9C1BB', accent: '#55A846', dark: '#37423A', variant: 'cabinet' },
  { key: 'sauter-cabinet', label: 'Sauter · régulation', brand: 'Sauter', types: ['armoire','equipement'], primary: '#DDE1E5', secondary: '#B8C0C8', accent: '#4173A7', dark: '#313C47', variant: 'cabinet' },

  { key: 'atlantic-air', label: 'Atlantic · CTA / VMC', brand: 'Atlantic', types: ['cta','vmc','ventilateur'], primary: '#D8E2E7', secondary: '#AFC0C9', accent: '#376C9B', dark: '#334653', variant: 'air_box' },
  { key: 'generic-air', label: 'CTA / VMC générique', brand: 'Générique', types: ['cta','vmc','ventilateur'], primary: '#788F9D', secondary: '#5D737F', accent: '#BBD4E0', dark: '#2A3B45', variant: 'air_box' },

  { key: 'generic-cylinder', label: 'Ballon / vase générique', brand: 'Générique', types: ['ballon','vase_expansion','bouteille','adoucisseur','bac_sel'], primary: '#7F93B6', secondary: '#60708C', accent: '#D9E4F1', dark: '#364456', variant: 'cylinder' },
  { key: 'generic-exchanger', label: 'Échangeur générique', brand: 'Générique', types: ['echangeur'], primary: '#BFA658', secondary: '#807348', accent: '#F4E7A8', dark: '#4B4635', variant: 'plate_exchanger' },
]);

const BRAND_ALIASES = [
  ['de dietrich', ['de dietrich','dedietrich','de-dietrich']],
  ['schneider electric', ['schneider','schneider electric']],
  ['viessmann', ['viessmann']],
  ['atlantic', ['atlantic']],
  ['bosch', ['bosch']],
  ['grundfos', ['grundfos']],
  ['wilo', ['wilo']],
  ['ksb', ['ksb']],
  ['lowara', ['lowara','xylem lowara']],
  ['weishaupt', ['weishaupt']],
  ['danfoss', ['danfoss']],
  ['siemens', ['siemens']],
  ['sauter', ['sauter']],
];

function canonicalBrand(value) {
  const text = normalize(value);
  if (!text) return '';
  for (const [canonical, aliases] of BRAND_ALIASES) {
    if (aliases.some((alias) => text.includes(normalize(alias)))) return canonical;
  }
  return text;
}

export function getSkinByKey(key) {
  return LAB3D_SKIN_LIBRARY.find((skin) => skin.key === key) || null;
}

export function listSkinsForType(typeCode) {
  const type = normalize(typeCode).replace(/ /g, '_') || 'equipement';
  const skins = LAB3D_SKIN_LIBRARY.filter((skin) => skin.types.includes(type));
  const generic = LAB3D_SKIN_LIBRARY.find((skin) => skin.key === 'generic');
  return skins.length ? skins : [generic];
}

export function resolveEquipmentSkin(equipment = {}, object = {}) {
  const explicitKey = object?.params?.visualSkinKey;
  if (explicitKey && explicitKey !== 'auto') {
    const explicit = getSkinByKey(explicitKey);
    if (explicit) return { ...explicit, source: 'manual' };
  }

  const type = normalize(object.subtype || equipment.type_code).replace(/ /g, '_') || 'equipement';
  const brand = canonicalBrand(equipment.marque || '');
  const model = normalize(equipment.modele || '');

  const candidates = LAB3D_SKIN_LIBRARY.filter((skin) => skin.types.includes(type));
  const branded = candidates.filter((skin) => canonicalBrand(skin.brand) === brand && brand);
  if (branded.length) {
    const exactModel = branded.find((skin) => (skin.modelHints || []).some((hint) => model.includes(normalize(hint))));
    if (exactModel) return { ...exactModel, source: 'brand-model' };
    return { ...branded[0], source: 'brand' };
  }

  const typeFallback = candidates.find((skin) => skin.brand === 'Générique') || candidates[0];
  if (typeFallback) return { ...typeFallback, source: 'type' };
  return { ...LAB3D_SKIN_LIBRARY[0], source: 'generic' };
}

export function skinDisplayName(skin) {
  if (!skin) return 'Skin générique';
  return skin.label || skin.brand || 'Skin générique';
}
