/** Écran Équipements : on signale l'exception (vétuste, HS, retiré, remplacé), sans pointage systématique. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../..', 'GuidedEquipmentPanel.js'), 'utf8');
const need = (t, why) => assert.ok(src.includes(t), `Équipements : ${why} (« ${t} » absent)`);
const forbid = (t, why) => assert.ok(!src.includes(t), `Équipements : ${why} (« ${t} » présent)`);

need("const FILTRES=[['tous','Tous'],['surveiller','À surveiller'],['nouveaux','Nouveaux']]", 'filtres Tous / À surveiller / Nouveaux');
need('PanResponder.create', 'glissement des lignes');
need("agir('vet')", 'action Vétuste');
need("agir('hs')", 'action HS');
need("agir('rep')", 'action Remplacé');
need("agir('ret')", 'action Retiré');
need('remplacerEquipement', 'le remplacement crée le nouvel équipement avant de retirer l’ancien');
assert.ok(src.indexOf('await creerEquipementVisite(visiteId);\n   for(const[cle,val]') < src.indexOf('await supprimerMateriel(item.id);\n   hapticSuccess();setFiltre'), 'Équipements : le nouvel équipement est créé avant de retirer l’ancien');
need("ETAT_HS='Hors service'", 'HS stocké avec la valeur acceptée par l’Intranet');
need("label:'Annuler'", 'chaque action d’état a son Annuler');
need('Autre équipement : lui donner un nom', 'création libre d’un équipement introuvable');
need("Créer « {ajout.q.trim()} »", 'création directe depuis la recherche de type');
need('Nombre à créer', 'création de plusieurs équipements identiques');
need('Retrouvé ailleurs sur le site', 'rattachement d’un équipement d’un autre local');
need('Photographier la plaque', 'ajout par la plaque en premier');
forbid('Tout présent', 'plus de pointage groupé');
forbid("'a-voir'", 'plus de filtre « à voir » dans la liste');
// L'envoi Intranet reprend tous les équipements : l'état de référence suffit quand rien n'est saisi.
const payload = fs.readFileSync(path.join(__dirname, '../..', 'intranetVisitPayload.js'), 'utf8');
assert.ok(payload.includes('currentState || (INTRANET_MATERIAL_STATES.includes(referenceState) ? referenceState : null)'), 'Intranet : état de référence repris pour un équipement non touché');
console.log('Écran Équipements (exception, glissement, menu +) : OK');
