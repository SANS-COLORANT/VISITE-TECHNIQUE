// Référentiel visuel commun au catalogue matériel.
// Les domaines servent uniquement à résoudre le logo constructeur via Logokit.
// Une URL logo explicitement enregistrée en base reste prioritaire côté interface.

export const EQUIPMENT_BRAND_DOMAINS = {
  'aldes': 'aldes.fr',
  'aircalo': 'aircalo.fr',
  'alfa laval': 'alfalaval.com',
  'atlantic': 'atlantic.fr',
  'belimo': 'belimo.com',
  'bosch': 'bosch-industrial.com',
  'bwt': 'bwt.com',
  'caleffi': 'caleffi.com',
  'carrier': 'carrier.com',
  'chappee': 'chappee.com',
  'ciat': 'ciat.com',
  'culligan': 'culligan.fr',
  'daikin': 'daikin.com',
  'danfoss': 'danfoss.com',
  'de dietrich': 'dedietrich-thermique.fr',
  'fernox': 'fernox.com',
  'flakt woods': 'flaktgroup.com',
  'flaktgroup': 'flaktgroup.com',
  'france air': 'france-air.com',
  'grundfos': 'grundfos.com',
  'halton': 'halton.com',
  'helios': 'heliosventilatoren.de',
  'honeywell': 'honeywell.com',
  'itron': 'itron.com',
  'kamstrup': 'kamstrup.com',
  'komfovent': 'komfovent.com',
  'ksb': 'ksb.com',
  'lennox': 'lennoxemea.com',
  'lowara': 'xylem.com',
  'nicotra gebhardt': 'nicotra-gebhardt.com',
  'nilan': 'nilan.fr',
  'novenco': 'novenco-building.com',
  'reflex': 'reflex-winkelmann.com',
  'rosenberg': 'rosenberg-gmbh.com',
  'salda': 'salda.lt',
  'salmson': 'salmson.com',
  's&p unelvent': 'solerpalau.com',
  'saunier duval': 'saunierduval.fr',
  'sauter': 'sauter-controls.com',
  'schako': 'schako.com',
  'schneider electric': 'se.com',
  'siemens': 'siemens.com',
  'sofrel': 'sofrel.com',
  'spirotech': 'spirotech.com',
  'swegon': 'swegon.com',
  'swep': 'swepgroup.com',
  'systemair': 'systemair.com',
  'trane': 'trane.com',
  'trox': 'trox.fr',
  'vaillant': 'vaillant.fr',
  'viessmann': 'viessmann.fr',
  'vim': 'vim.fr',
  'vortice': 'vortice.com',
  'weishaupt': 'weishaupt.fr',
  'wika': 'wika.com',
  'wit': 'wit.fr',
  'wolf': 'wolf.eu',
  'wilo': 'wilo.com',
  'zehnder': 'zehnder.fr',
  'zilmet': 'zilmet.it',
};

export function normaliserMarqueVisuelle(nom = '') {
  return String(nom)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getEquipmentBrandLogoUri(nom = '') {
  const domaine = EQUIPMENT_BRAND_DOMAINS[normaliserMarqueVisuelle(nom)];
  return domaine ? `https://img.logokit.com/${domaine}` : null;
}
