/** Définition autonome de la TRAME VMC. Le libellé V2 n'est jamais exposé dans l'application. */
import * as XLSX from 'xlsx';

const nr = [{ label: 'Non relevé', commentaire: "Ce point n'a pas été relevé lors de la visite." }];
const so = [{ label: 'Sans objet', commentaire: 'Sans objet.' }];
const nv = [{ label: 'Non visible', commentaire: "Ce point n'est pas visible ou accessible dans les conditions de la visite." }];

function p(label, commentaire, reserve = null, poste = 'VMC') { return { label, commentaire, reserve, poste }; }
function ctrl(cle, s, ns, poste = 'VMC') {
  return { cle, type: 'controle', vmc: true, poste, presets: { S: s, 'N.S': ns, 'N.R': nr, 'S.O': so, 'N.V': nv } };
}

const LIB = {
  situation: ctrl('Situation du caisson',
    [p('Implantation correcte', "Le caisson est implanté dans une zone adaptée et sa situation ne présente pas d'anomalie apparente."), p('Situation identifiable', 'Le caisson est correctement localisé et identifiable.')],
    [p('Implantation inadaptée', "L'implantation du caisson n'est pas adaptée et complique son exploitation ou sa maintenance.", "Revoir l'implantation ou les conditions d'accès au caisson afin de permettre une exploitation et une maintenance satisfaisantes."), p('Zone encombrée', "La zone autour du caisson est encombrée et gêne les opérations de maintenance.", "Dégager la zone autour du caisson afin de rétablir un espace de maintenance suffisant.")], 'Accès / sécurité'),
  acces: ctrl('Accès au caisson',
    [p('Accès facile', "L'accès au caisson est facile, dégagé et permet les opérations de maintenance dans de bonnes conditions."), p('Accès satisfaisant', "L'accès au caisson est satisfaisant.")],
    [p('Accès difficile', "L'accès au caisson est difficile et ne permet pas une intervention aisée.", "Améliorer l'accès au caisson afin de permettre les opérations de maintenance dans de bonnes conditions."), p('Accès dangereux', "L'accès au caisson présente un risque pour les intervenants.", "Sécuriser l'accès au caisson avant toute intervention de maintenance."), p('Accès encombré', "L'accès au caisson est encombré.", "Dégager et maintenir libre l'accès au caisson."), p('Échelle nécessaire', "L'accès au caisson nécessite l'utilisation d'une échelle.", "Mettre en place un moyen d'accès permanent et sécurisé au caisson lorsque cela est nécessaire.")], 'Accès / sécurité'),
  gardeCorps: ctrl('Garde-corps / ligne de vie',
    [p('Garde-corps présent', 'Un garde-corps est présent et assure la protection de la zone d’intervention.'), p('Ligne de vie présente', 'Une ligne de vie est présente pour sécuriser les interventions.'), p('Protection adaptée', 'Le dispositif de protection contre les chutes est adapté à la zone d’intervention.')],
    [p('Protection absente', "Aucun dispositif de protection contre les chutes n'est présent dans la zone d'intervention.", "Mettre en place un dispositif de protection contre les chutes adapté à l'accès et à la maintenance du caisson VMC."), p('Protection incomplète', 'Le dispositif de protection contre les chutes est incomplet.', 'Compléter le dispositif de protection contre les chutes afin de sécuriser la totalité de la zone d’intervention.'), p('Ligne de vie absente', "Aucune ligne de vie n'est présente alors que la configuration de la zone nécessite une protection adaptée.", "Mettre en place une ligne de vie ou une protection collective adaptée à la configuration de la zone.")], 'Accès / sécurité'),

  etatCaisson: ctrl('Etat du caisson',
    [p('Bon état', 'Le caisson est en bon état général et ne présente pas de dégradation apparente.'), p('État correct', "L'état général du caisson est satisfaisant et ne nécessite pas d'intervention particulière.")],
    [p('Corrodé', 'Le caisson présente des traces de corrosion. Un traitement des zones concernées est à prévoir afin de limiter la progression de la corrosion.', 'Traiter les zones corrodées du caisson et reprendre la protection de surface.'), p('Fortement corrodé', "Le caisson présente une corrosion importante susceptible d'affecter sa pérennité. Une remise en état ou son remplacement est à prévoir.", "Remettre en état ou remplacer le caisson fortement corrodé selon le diagnostic de l'exploitant."), p('Dégradé', 'Le caisson présente plusieurs dégradations et nécessite une remise en état.', 'Procéder à la remise en état du caisson et remplacer les éléments dégradés.'), p('Vétuste', 'Le caisson est vétuste et présente un état général dégradé.', 'Programmer la remise en état ou le remplacement du caisson vétuste.')], 'Caisson VMC'),
  fonctionnement: ctrl('Fonctionnement',
    [p('Fonctionnel', "Le caisson est en fonctionnement et ne présente pas d'anomalie apparente."), p('Fonctionnement normal', 'Le fonctionnement du caisson est normal lors de la visite.')],
    [p('À l’arrêt', "Le caisson VMC est à l'arrêt lors de la visite. L'origine du défaut doit être recherchée et le fonctionnement rétabli.", "Rechercher l'origine de l'arrêt et remettre le caisson VMC en fonctionnement."), p('Bruit anormal', 'Un bruit anormal est constaté lors du fonctionnement du caisson. Un contrôle du moteur, de la transmission et des organes mécaniques est à réaliser.', "Contrôler le moteur, la transmission et les organes mécaniques afin de supprimer le bruit anormal."), p('Vibrations', 'Des vibrations anormales sont constatées sur le caisson en fonctionnement. Le supportage, l’équilibrage et les organes mécaniques doivent être contrôlés.', 'Contrôler le supportage, l’équilibrage et les organes mécaniques du caisson afin de supprimer les vibrations.'), p('Fonctionnement intermittent', 'Le fonctionnement du caisson est intermittent et nécessite un diagnostic.', 'Diagnostiquer le fonctionnement intermittent du caisson et rétablir un fonctionnement normal.')], 'Caisson VMC'),
  nettoyageCaisson: ctrl('Nettoyage caisson',
    [p('Propre', 'Le caisson présente un état de propreté satisfaisant.'), p('Nettoyage correct', "L'état de propreté du caisson est correct lors de la visite.")],
    [p('Encrassé', 'Le caisson présente un encrassement nécessitant un nettoyage.', 'Procéder au nettoyage complet du caisson VMC.'), p('Fortement encrassé', 'Le caisson est fortement encrassé et son nettoyage est nécessaire.', 'Procéder au nettoyage approfondi du caisson et contrôler son fonctionnement après intervention.')], 'Entretien VMC'),
  courroie: ctrl('Etat courroie',
    [p('Bon état', 'La courroie est en bon état et sa tension est satisfaisante.'), p('Transmission directe', "Le caisson est équipé d'une transmission directe et ne comporte pas de courroie.")],
    [p('Détendue', 'La courroie présente une tension insuffisante. Son réglage est à réaliser afin de garantir une transmission correcte.', 'Retendre la courroie et contrôler son état ainsi que l’alignement de la transmission.'), p('Usée', "La courroie présente des signes d'usure. Son remplacement est à prévoir afin d'éviter une rupture en fonctionnement.", 'Remplacer la courroie usée et contrôler la tension ainsi que l’alignement de la transmission.'), p('Craquelée', "La courroie présente des craquelures témoignant d'une usure avancée. Son remplacement est à prévoir.", 'Remplacer la courroie craquelée et contrôler la transmission.'), p('Cassée', "La courroie est cassée et ne permet plus l'entraînement du ventilateur. Son remplacement est nécessaire.", 'Remplacer la courroie cassée et vérifier le bon fonctionnement du caisson après intervention.')], 'Transmission VMC'),
  coupure: ctrl('Coupure électrique',
    [p('Présente et accessible', 'La coupure électrique est présente, accessible et permet la consignation du caisson.'), p('Présente et repérée', 'La coupure électrique est présente et correctement repérée.')],
    [p('Absente', "Aucune coupure électrique de proximité n'est identifiée pour le caisson.", 'Installer une coupure électrique de proximité adaptée au caisson VMC.'), p('Non repérée', "La coupure électrique est présente mais n'est pas correctement repérée.", 'Mettre en place un repérage durable et lisible de la coupure électrique du caisson.'), p('Inaccessible', 'La coupure électrique est difficilement accessible.', "Rendre la coupure électrique facilement accessible pour les opérations de consignation et de maintenance.")], 'Électricité VMC'),

  manchette: ctrl('Etat manchette',
    [p('Bon état', "La manchette est en bon état et ne présente pas de dégradation apparente."), p('État correct', "La manchette présente un état général satisfaisant et ne nécessite pas d'intervention particulière.")],
    [p('Dégradée', 'La manchette est dégradée et doit être remplacée.', "Procéder au remplacement de la manchette dégradée et vérifier l'étanchéité de la liaison entre le caisson et le réseau aéraulique."), p('Déchirée', "La manchette présente une déchirure susceptible de générer des fuites d'air. Son remplacement est à prévoir.", "Remplacer la manchette déchirée et vérifier l'étanchéité de la liaison."), p('Percée', "La manchette est percée et ne permet plus d'assurer correctement l'étanchéité du réseau. Elle doit être remplacée.", "Remplacer la manchette percée et contrôler l'étanchéité du raccordement."), p('Déboîtée', "La manchette est partiellement déboîtée. Sa remise en place et le contrôle de son étanchéité sont à prévoir.", "Remettre en place la manchette et contrôler l'étanchéité de la liaison."), p('Absente', "Absence de manchette entre le caisson et le réseau aéraulique. La mise en place d'une manchette adaptée est à prévoir.", 'Mettre en place une manchette adaptée entre le caisson et le réseau aéraulique.')], 'Réseau aéraulique'),
  etatTrainasse: ctrl('Etat extérieur traînasse',
    [p('Bon état', "L'état extérieur de la traînasse est satisfaisant et ne présente pas de dégradation apparente."), p('État correct', "L'état extérieur de la traînasse est correct.")],
    [p('Corrodée', 'La traînasse présente des traces de corrosion.', 'Traiter les zones corrodées de la traînasse et reprendre la protection de surface.'), p('Dégradée', 'La traînasse présente des dégradations nécessitant une remise en état.', 'Remettre en état les parties dégradées de la traînasse.'), p('Percée', "La traînasse présente un percement pouvant entraîner des fuites d'air.", 'Réparer ou remplacer la partie percée de la traînasse et contrôler son étanchéité.')], 'Réseau aéraulique'),
  etancheiteTrainasse: ctrl('Etanchéité traînasse',
    [p('Étanche', "Aucun défaut d'étanchéité apparent n'est constaté sur la traînasse."), p('Étanchéité correcte', "L'étanchéité apparente de la traînasse est satisfaisante.")],
    [p('Fuite d’air', "Une fuite d'air est constatée au niveau de la traînasse. Une reprise de l'étanchéité du réseau est à réaliser.", "Reprendre l'étanchéité de la traînasse au droit de la fuite constatée."), p('Défaut de raccordement', "Le raccordement de la traînasse présente un défaut d'étanchéité. Une reprise des assemblages est à prévoir.", "Reprendre les assemblages et l'étanchéité du raccordement de la traînasse.")], 'Réseau aéraulique'),
  nettoyageTrainasse: ctrl('Nettoyage traînasse',
    [p('Propre', 'La traînasse présente un état de propreté satisfaisant.'), p('État correct', "L'état de propreté de la traînasse est correct.")],
    [p('Encrassée', 'La traînasse présente un encrassement nécessitant un nettoyage.', 'Procéder au nettoyage de la traînasse et des zones accessibles du réseau.'), p('Fortement encrassée', 'La traînasse est fortement encrassée.', 'Procéder au nettoyage approfondi de la traînasse et contrôler le réseau aéraulique.')], 'Entretien VMC'),
  pied: ctrl('Pied de soutien',
    [p('Présent et stable', 'Le pied de soutien est présent, stable et en bon état.'), p('Supportage correct', 'Le supportage de la traînasse est satisfaisant.')],
    [p('Absent', 'Le pied de soutien est absent alors que le réseau nécessite un supportage.', 'Mettre en place un supportage adapté de la traînasse.'), p('Dégradé', 'Le pied de soutien est dégradé et nécessite une remise en état.', 'Remplacer ou remettre en état le pied de soutien dégradé.'), p('Instable', 'Le supportage présente une instabilité.', 'Reprendre le supportage afin de garantir la stabilité du réseau.')], 'Réseau aéraulique'),
  registre: ctrl('Registre',
    [p('Présent et fonctionnel', 'Le registre est présent, accessible et son état apparent est satisfaisant.'), p('Accessible', 'Le registre est présent et accessible.')],
    [p('Absent', "Aucun registre n'est présent à l'emplacement contrôlé.", 'Mettre en place un registre adapté lorsque son absence ne permet pas le réglage attendu du réseau.'), p('Bloqué', 'Le registre est bloqué et ne permet pas le réglage du réseau.', 'Débloquer ou remplacer le registre afin de rétablir son fonctionnement.'), p('Inaccessible', 'Le registre est présent mais difficilement accessible.', "Améliorer l'accessibilité du registre pour permettre son réglage et sa maintenance.")], 'Réseau aéraulique'),
  trappe: ctrl('Trappe de visite',
    [p('Présente et accessible', 'La trappe de visite est présente et accessible pour les opérations de maintenance.'), p('Bon état', 'La trappe de visite est en bon état apparent.')],
    [p('Absente', "Aucune trappe de visite n'est présente sur cette partie du réseau. La création d'un accès adapté est à prévoir afin de permettre les opérations d'entretien et de nettoyage.", "Créer une trappe de visite adaptée afin de permettre l'entretien et le nettoyage du réseau."), p('Inaccessible', "La trappe de visite est présente mais son accès ne permet pas une intervention aisée. L'accessibilité doit être améliorée.", "Rendre la trappe de visite facilement accessible pour les opérations d'entretien."), p('Dégradée', 'La trappe de visite est dégradée et ne permet plus une fermeture satisfaisante.', 'Remettre en état ou remplacer la trappe de visite dégradée.')], 'Réseau aéraulique'),
  chapeau: ctrl('Chapeau',
    [p('Bon état', 'Le chapeau est en bon état et correctement fixé.'), p('Fixation correcte', 'Le chapeau est correctement fixé et ne présente pas de dégradation apparente.')],
    [p('Dégradé', 'Le chapeau est dégradé et nécessite une remise en état.', 'Remettre en état ou remplacer le chapeau dégradé.'), p('Corrodé', 'Le chapeau présente des traces de corrosion.', 'Traiter la corrosion ou remplacer le chapeau selon son état.'), p('Absent', 'Le chapeau est absent.', 'Mettre en place un chapeau adapté et correctement fixé.')], 'Réseau aéraulique'),
  nettoyageColonne: ctrl('Nettoyage colonne',
    [p('Nettoyage réalisé', 'Le nettoyage des colonnes est indiqué comme réalisé.'), p('État satisfaisant', "L'état de propreté apparent des colonnes est satisfaisant.")],
    [p('Nettoyage à prévoir', 'Le nettoyage des colonnes est à prévoir.', 'Programmer et réaliser le nettoyage des colonnes de ventilation.'), p('Colonne encrassée', 'La colonne présente un encrassement nécessitant un nettoyage.', 'Procéder au nettoyage de la colonne de ventilation.'), p('Aucun justificatif', "Aucun justificatif récent de nettoyage des colonnes n'a été présenté lors de la visite.", 'Fournir le justificatif du dernier nettoyage ou programmer le nettoyage des colonnes.')], 'Entretien VMC'),

  telegestion: ctrl('Télégestion',
    [p('Présente et fonctionnelle', 'La télégestion est présente et son fonctionnement apparent est satisfaisant.'), p('Report d’alarme présent', "Un report d'alarme du caisson est présent.")],
    [p('Absente', "Aucune télégestion n'est présente pour le caisson.", "Étudier la mise en place d'un report de fonctionnement ou d'alarme du caisson selon les exigences d'exploitation."), p('En défaut', 'La télégestion présente un défaut de fonctionnement.', 'Diagnostiquer et remettre en état la télégestion du caisson.'), p('Report d’alarme absent', "Aucun report d'alarme n'est identifié pour le caisson.", "Mettre en place ou rétablir le report d'alarme du caisson selon les exigences d'exploitation.")], 'Gestion VMC'),
  pressostat: ctrl('Pressostat',
    [p('Présent et fonctionnel', 'Le pressostat est présent et son fonctionnement apparent est satisfaisant.'), p('Présent', 'Le pressostat est présent sur le caisson.')],
    [p('Absent', "Aucun pressostat n'est présent sur le caisson. La mise en place d'un dispositif permettant de contrôler le fonctionnement de l'extraction est à prévoir.", "Mettre en place un pressostat ou un dispositif adapté permettant de contrôler le fonctionnement de l'extraction."), p('En défaut', 'Le pressostat est présent mais son fonctionnement est défaillant. Son contrôle et sa remise en état sont à prévoir.', 'Contrôler et remettre en état ou remplacer le pressostat défaillant.'), p('Débranché', 'Le pressostat est présent mais débranché.', 'Rebrancher le pressostat et vérifier son bon fonctionnement ainsi que le report éventuel de défaut.')], 'Gestion VMC'),
};

function panelCaisson(numero) {
  return {
    Situation: [
      { cle: `Identification du caisson n°${numero}`, type: 'champ', hiddenInApp: true },
      LIB.situation, LIB.acces, LIB.gardeCorps,
    ],
    Caisson: [LIB.etatCaisson, LIB.fonctionnement, LIB.nettoyageCaisson, LIB.courroie, LIB.coupure],
    Distribution: [LIB.manchette, LIB.etatTrainasse, LIB.etancheiteTrainasse, LIB.nettoyageTrainasse, LIB.pied, LIB.registre, LIB.trappe, LIB.chapeau, LIB.nettoyageColonne],
    Gestion: [LIB.telegestion, LIB.pressostat],
  };
}

export const VMC_PANELS = {
  'p-vmc-infos': { 'Informations générales': [
    { cle: 'Date de visite', type: 'champ' }, { cle: 'N° de site', type: 'champ' }, { cle: 'Référence du site', type: 'champ' },
    { cle: 'Exploitant', type: 'champ' }, { cle: 'Nombre de bâtiments / entrées', type: 'champ' }, { cle: 'Nombre de logements', type: 'champ' },
    { cle: "Nombre d'étages", type: 'champ' }, { cle: 'Type de ventilation', type: 'champ' }, { cle: 'Nombre de caissons', type: 'champ' }, { cle: 'Type de bouche', type: 'champ' },
  ] },
  'p-vmc-c1': panelCaisson(1), 'p-vmc-c2': panelCaisson(2), 'p-vmc-c3': panelCaisson(3),
  'p-vmc-c4': panelCaisson(4), 'p-vmc-c5': panelCaisson(5), 'p-vmc-c6': panelCaisson(6),
};

const caissonRows = [
  { Situation: [28, 29, 30], Caisson: [35, 36, 37, 38, 39], Distribution: [44, 45, 46, 47, 48, 49, 50, 51, 52], Gestion: [57, 58] },
  { Situation: [65, 66, 67], Caisson: [72, 73, 74, 75, 76], Distribution: [81, 82, 83, 84, 85, 86, 87, 88, 89], Gestion: [94, 95] },
  { Situation: [102, 103, 104], Caisson: [109, 110, 111, 112, 113], Distribution: [118, 119, 120, 121, 122, 123, 124, 125, 126], Gestion: [131, 132] },
  { Situation: [139, 140, 141], Caisson: [146, 147, 148, 149, 150], Distribution: [155, 156, 157, 158, 159, 160, 161, 162, 163], Gestion: [168, 169] },
  { Situation: [176, 177, 178], Caisson: [183, 184, 185, 186, 187], Distribution: [192, 193, 194, 195, 196, 197, 198, 199, 200], Gestion: [205, 206] },
  { Situation: [213, 214, 215], Caisson: [220, 221, 222, 223, 224], Distribution: [229, 230, 231, 232, 233, 234, 235, 236, 237], Gestion: [242, 243] },
];

function normaliser(panelId, section) { return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_'); }

export const VMC_FIELD_MAPPINGS = [
  ...['Date de visite', 'N° de site', 'Référence du site', 'Exploitant', 'Nombre de bâtiments / entrées', 'Nombre de logements', "Nombre d'étages", 'Type de ventilation', 'Nombre de caissons', 'Type de bouche']
    .map((cle, i) => ({ panelId: 'p-vmc-infos', section: 'Informations générales', sectionCode: normaliser('p-vmc-infos', 'Informations générales'), cle, type: 'champ', valueCell: `C${12 + i}`, commentCell: null })),
  ...caissonRows.flatMap((rows, idx) => {
    const panelId = `p-vmc-c${idx + 1}`;
    return Object.entries(panelCaisson(idx + 1)).flatMap(([section, fields]) => fields.filter((field) => field.type === 'controle').map((field, fi) => ({
      panelId, section, sectionCode: normaliser(panelId, section), cle: field.cle, type: 'controle', valueCell: `B${rows[section][fi]}`, commentCell: `C${rows[section][fi]}`,
    })));
  }),
];

function construireModeleExcelVmc() {
  const wb = XLSX.utils.book_new();
  const data = Array.from({ length: 243 }, () => ['', '', '', '', '']);
  const put = (row, a, b = '', c = '', d = '', e = '') => { data[row - 1] = [a, b, c, d, e]; };
  put(1, 'Nom du client'); put(2, 'Nom du site'); put(3, 'Nom du local'); put(4, 'Trame utilisée', 'VMC'); put(5, 'Date de la visite');
  put(7, 'INFORMATIONS GÉNÉRALES'); put(9, 'Informations générales'); put(11, 'Intitulé', 'Avis', 'Commentaire', 'Avis', 'Commentaire');
  ['Date de visite', 'N° de site', 'Référence du site', 'Exploitant', 'Nombre de bâtiments / entrées', 'Nombre de logements', "Nombre d'étages", 'Type de ventilation', 'Nombre de caissons', 'Type de bouche'].forEach((v, i) => put(12 + i, v));
  const starts = [23, 60, 97, 134, 171, 208];
  starts.forEach((start, i) => {
    const off = i * 37;
    put(start, `DESCRIPTIF TECHNIQUE CAISSON ${i + 1}`);
    put(25 + off, 'Situation'); put(27 + off, 'Intitulé', 'Avis', 'Commentaire', 'Avis', 'Commentaire');
    ['Situation du caisson', 'Accès au caisson', 'Garde-corps / ligne de vie'].forEach((v, j) => put(28 + off + j, v));
    put(32 + off, 'Caisson'); put(34 + off, 'Intitulé', 'Avis', 'Commentaire', 'Avis', 'Commentaire');
    ['Etat du caisson', 'Fonctionnement', 'Nettoyage caisson', 'Etat courroie', 'Coupure électrique'].forEach((v, j) => put(35 + off + j, v));
    put(41 + off, 'Distribution'); put(43 + off, 'Intitulé', 'Avis', 'Commentaire', 'Avis', 'Commentaire');
    ['Etat manchette', 'Etat extérieur traînasse', 'Etanchéité traînasse', 'Nettoyage traînasse', 'Pied de soutien', 'Registre', 'Trappe de visite', 'Chapeau', 'Nettoyage colonne'].forEach((v, j) => put(44 + off + j, v));
    put(54 + off, 'Gestion'); put(56 + off, 'Intitulé', 'Avis', 'Commentaire', 'Avis', 'Commentaire');
    ['Télégestion', 'Pressostat'].forEach((v, j) => put(57 + off + j, v));
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 31 }, { wch: 10 }, { wch: 62 }, { wch: 13 }, { wch: 13 }];
  ws['!merges'] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }, { s: { r: 1, c: 1 }, e: { r: 1, c: 2 } }, { s: { r: 2, c: 1 }, e: { r: 2, c: 2 } }, { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } }, { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } }];
  XLSX.utils.book_append_sheet(wb, ws, 'TRAME VMC v2');
  const remarques = XLSX.utils.aoa_to_sheet([['REMARQUES PARTICULIERES'], [], ['Poste', 'Prestation', 'Date de la réserve', 'Délai', "Etat d'avancement", 'Estimatif']]);
  remarques['!cols'] = [{ wch: 26 }, { wch: 70 }, { wch: 18 }, { wch: 12 }, { wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, remarques, 'REMARQUES');
  const materiel = XLSX.utils.aoa_to_sheet([['LISTING MATERIEL'], [], ['Catégorie', 'Nombre', 'Désignation', 'N°matériel', 'Réseau desservi', 'Marque', 'Modèle', 'Caractéristiques', 'Année', 'Etat']]);
  materiel['!cols'] = Array.from({ length: 10 }, (_, i) => ({ wch: i === 7 ? 35 : 18 }));
  XLSX.utils.book_append_sheet(wb, materiel, 'MATERIEL');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['NOTES'], ['']]), 'NOTE');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
}

export const VMC_TEMPLATE_BASE64 = construireModeleExcelVmc();
