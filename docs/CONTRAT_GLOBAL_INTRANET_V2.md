# Contrat commun MÉTRA ↔ Intranet V2 — spécification de développement

Statut **PROPOSITION CONTRACTUELLE, non déployée** (28/10/2026).
Le seul serveur examiné par l'IA Intranet est son dépôt local Symfony. Aucune
preuve authentifiée sur la production et aucun accès Symfony en écriture ici.
Les endpoints V2 ci-dessous sont des **exigences futures**, et NON des routes actives.

## 0. Objectif et périmètre
Toutes les visites techniques (ICPE, RCU, VMC, Pré-allumage, REMAR et futures
trames publiées) utilisent une description serveur versionnée unique. Le moteur
doit rester offline-first et ne jamais rendre une nouvelle visite incompatible
avec les anciennes données. Le module Missions n'a **aucune** dépendance Intranet.
Une trame locale non publiée reste utilisable pour saisie, Excel, PDF mais ne
peut être envoyée sous une autre trame serveur par défaut.

## 1. Problèmes réels établis par les deux audits
- Symfony V1 `ReceptionVisiteService.php:323-367` supprime puis recrée
  **l'intégralité** des matériels du LOCAL. Absence d'identité stable; même
  longueur ne signifie pas mêmes matériels. La PR #110 bloque les snapshots
  incomplets côté MÉTRA, y compris les anciennes outbox.
- Le catalogue `TypeTrame` V1 ne porte que `id,nom`, sans clé stable, version,
  empreinte, capacité ni `tramesAutorisees`. L'identification par nom/ordre
  restera fragile jusqu'à adoption commune de V2.
- `remarques[]` POST sans identifiant de réserve; chaque visite crée une
  nouvelle réserve, le GET ne restitue que la dernière visite globale.
- Réseaux et régulation en commentaires de critères (maximum 1500 caractères)
  sans objet réseau/compteur/horaires stable.
- L'authentification MÉTRA actuelle utilise `Authorization: DPoP <jeton>`
  et une preuve `DPoP`. **La mention Bearer dans le questionnaire était un
  exemple documentaire erroné, pas un bug démontré.**
- Les dix synthèses RCU Primaire/Secondaire de #109 sont testées localement
  mais non certifiées sur un GET RCU réel. Aucun GO terrain.
- Le numéro de dernière visite globale est un verrou optimiste V1, mais
  il n'y a pas de verrou atomique sur deux tablettes ni de version d'inventaire.

## 2. API V1 à conserver pendant la migration
`GET /api/clients/{id}/preparation-visites[?trame=<id numérique>]`;
`GET /api/clients/{id}/referentiel-structure`;
`POST /api/clients/{id}/visites`;
`POST /api/clients/{id}/visites/{idVisite}/photos`.
V1 utilise `envoiId` UUID v4, une visite par LOCAL, tous les critères et
le triplet (categorieId,sousCategorieId,critereId), `avis`, `commentaire`,
`remarques[]`, `materiels[]`, `notes[]`. Photos séparées avec `envoiPhotoId`.
Ne jamais modifier cette sémantique en silence pour les anciens APK.

## 3. Catalogue V2 versionné (serveur à implémenter)
Route proposée : `GET /api/clients/{id}/catalogue-trames?schemaVersion=2`.
Réponse candidate :
```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-10-28T10:00:00+01:00",
  "trames": [{
    "idSymfony": 85,
    "cleMetierStable": "reseau_chaleur",
    "version": 1,
    "empreinte": "sha256:<64 caracteres hexadecimaux>",
    "statut": "active",
    "capabilities": ["criteres","reserves","materiels","photos","reseaux"],
    "criteres": [{
      "brancheId": "100:200:300",
      "cleMetierStable": "rcu.primaire.synthese.p2",
      "type": "synthese",
      "obligatoire": true,
      "avis": {"applicable": true},
      "unite": null,
      "sourceCalculee": "reserves[perimetre=primaire,categorie=p2]"
    }]
  }]
}
```
Tous les IDs/valeurs de cet exemple sont **fictifs**. Le backend fournit
`tramesAutorisees[]` sur chaque LOCAL avec `cleMetierStable,version,empreinte`.
La clé de critère reste immuable entre versions tant que sa sémantique ne change
pas. Un renommage de libellé n'est **pas** un changement d'identité. Une
rupture de signification impose une nouvelle clé métier/version. L'empreinte
porte sur les critères, ordres, types et règles de validité canoniques.

MÉTRA n'accepte une trame en envoi que si elle est publiée et attribuée au
LOCAL, que son couple version/empreinte correspond à celui figé lors de la
préparation et que **100 % des critères obligatoires** ont un mapping
déclaratif explicite. Le contrôle pur déjà livré côté MÉTRA est
`intranetV2Catalog.js` ; il n'est pas encore connecté à un GET Symfony V2.

## 4. Prévalidation sans écriture
Route proposée : `POST /api/clients/{id}/visites/prevalidation`
avec `envoiId` temporaire, LOCAL, version/empreinte de trame, IDs de critères,
versions du patrimoine et intention de mutation. La réponse expose :
`compatible | perime | incompatible`, codes machine stables, chemins
`visites[0].criteres[i]`, liste de défauts, version actuelle et conseils
d'actualisation. La prévalidation est répétable à l'ouverture d'une trame
lorsqu'Internet est disponible, puis avant tout POST. Hors ligne, une
prévalidation locale déterministe fonctionne avec le catalogue gelé; elle ne
doit jamais promettre qu'un serveur inchangé acceptera encore l'envoi.

## 5. Références, valeurs et historiques
- Identité physique : client/lot/site/local par IDs immuables, site partageable
  entre lots. Les homonymes ne sont pas des clés.
- Identité d'un contrôle : `cleMetierStable` + `brancheId` versionné ; conserver
  l'ancien triplet pour les visites V1 et la provenance `visiteSourceId`.
- Valeurs V2 explicites : `absent | nonRenseigne | nonVerifie | nonApplicable |
  herite | valeur | efface`. `null`, `/` et chaînes vides V1 sont
  interprétés selon leur **contrat historique**, jamais comme une instruction
  de suppression globale implicite.
- Historique ICPE A → Données techniques B → ICPE C : récupérer la dernière
  valeur par critère, même issue d'une autre visite source.
- Réserves : `reserveId`, `version`, `visiteSourceId`, états métier distincts
  de `verifieePendantVisite`, journal d'événements create/update/close/cancel.
  Le GET présente toutes les réserves ouvertes du LOCAL, quelle que soit
  la trame de la dernière visite.
- Matériel : `materielId`, `version` et opérations
  `create/update/delete` atomiques; le snapshot entier V1 reste lisible
  mais ne doit pas être autorisé si incomplet ou sans verrou/version.
- Réseaux, compteurs et courbes : objets typés avec ID permanent, unités,
  historique d'index, temps de mesure et JSON versionné
  `courbe_points_v1` / `programme_hebdomadaire_v1`, conservant les champs
  historiques pente/TNC/programmes texte en double lecture.
- Photos : consentement explicite pour photos libres, `envoiPhotoId`, création
  idempotente, endpoint authentifié de retrait/révocation, journal d'événements.

## 6. Nouvelles écritures et sécurité (serveur à implémenter)
Proposition de route V2 :
`POST /api/clients/{id}/visites/v2`.
Reçoit `schemaVersion, envoiId, visites[]`, chacune avec
`localId,trameCle,versionTrame,empreinteTrame,versionPatrimoine,
derniereVisiteIdSource,criteres,mutationsMateriels,mutationsReserves,
reseaux,compteurs,regulations,notes`. Le serveur traite :
1. authentification stricte DPoP, autorisation du client/site/local;
2. verrou atomique LOCAL et versions des ressources, dans une transaction;
3. validation complète par version/empreinte gelée (anciennes versions
   conservées pendant la fenêtre offline);
4. détection idempotente tablette + envoiId + corps exact;
5. opérations explicites (jamais DELETE induit par élément absent);
6. accusé durable et consultable par ID d'envoi, pour reprendre les coupures;
7. photos séparées avec leur propre accusé et états.

Routes proposées complémentaires (NON EXISTANTES) :
`GET /api/clients/{id}/visites/envois/{envoiId}`;
`GET /api/clients/{id}/locaux/{localId}/reserves?etat=ouvert`;
`PATCH /api/clients/{id}/locaux/{localId}/reserves/{reserveId}`;
`DELETE /api/clients/{id}/visites/{visiteId}/photos/{photoId}` avec contrôle
strict d'auteur/consentement. Aucune suppression automatique si un appareil est
hors ligne.

## 7. Déploiement sûr et réversibilité
A. Développer Symfony V2 de manière **additive** : nouvelles entités/colonnes
   nullable, backfill avec provenance, tests, double lecture V1/V2.
B. Exposer un catalogue et prévalidation en test. Publier quelques
   trames pilotes sans modifier l'API V1.
C. MÉTRA négocie la version V2 **uniquement quand le serveur la supporte** ;
   sinon garde son outbox V1 durcie et le mode local/export. Ne jamais changer
   les octets d'un ancien envoi gelé pour le migrer.
D. Tester chaque ancienne trame + prochaine trame, perte de réseau, reprise
   même UUID, deux tablettes, photo privée, historiques et sauvegardes.
E. Activer V2 par client/trame, puis par lots; surveillance des conflits et
   rollback par désactivation de fonctionnalité sans DOWN destructif.
F. Aucune fusion ni APK de production avant GO QA + validation de terrain.

## 8. Matrice minimale de recette communiquée aux deux IA
- T01 : RCU dix branches et aucun avis inventé, GET→POST→GET.
- T02 : trame RCU absente : refuse sans basculer ICPE.
- T03 : ICPE→DT→ICPE, homonymes ECS/chauffage sans permutation.
- T04 : première visite trame sélectionnée par ID et locale sans historique.
- T05 : 80 matériels + 1 nouveau, 81 après POST.
- T06 : même nombre de matériels mais identité différente : refus V1.
- T07 : ancienne file SQLite destructive : refus AVANT HTTP.
- T08 : réserve ouverte suivie sur 3 visites sans doublon.
- T09 : réserve vérifiée ≠ levée.
- T10 : deux réseaux + plusieurs compteurs, unités et courbes horaires.
- T11 : photos libres privées/non privées, upload repris et révocation.
- T12 : timeout après commit; un seul envoiId et une seule visite.
- T13 : 409/422/429/5xx, aucune recréation nouvelle hors contrôle.
- T14 : deux tablettes modifiant le même local, conflit explicite.
- T15 : trame personnalisée non publiée : mode local seulement.
- T16 : nouvelle version après saisie hors ligne, pas de perte ou d'écrasement.
- T17 : test de non-régression ICPE/VMC/RCU/PRE/REMAR/SQLite/Excel/PDF.
- T18 : APK signé avec identifiant `com.visitetechnique.tablet` inchangé,
  versionCode croissant et installation en mise à jour.

## 9. Blocages explicites avant GO global
- Le dépôt Symfony n'est PAS accessible dans la connexion GitHub actuelle;
  aucune des routes V2 ne peut être ajoutée/testée ici.
- Aucun GET RCU de production anonymisé, ID RCU réel ni POST authentifié
  reçu pour la visite des Ulis.
- La PR #109 et le nouveau durcissement V1 nécessitent CI/APK et essai
  physique; les tests locaux ne prouvent pas la persistance côté Symfony.
- Les nouvelles trames ne seront pas synchronisées automatiquement tant
  que le serveur n'a pas publié et validé leur description V2.

## Definition of Done
GO seulement si : tous les critères d'une trame publiée sont mappés;
0 disparition/duplication involontaire de matériels, réserves et photos;
idempotence après coupure; historiques maintenus; rollback documenté;
tests de bout en bout multi-trames validés sur serveur de test et APK réel.

## Versions historiques et validation stricte des nouvelles trames

Le catalogue peut publier plusieurs versions simultanées pour une même
`cleMetierStable`. Le couple `(cleMetierStable, version)` est unique.
La version figée et son empreinte ne sont jamais remplacées implicitement.
Une ancienne version `deprecated` reste admissible pour une visite réellement
hors ligne uniquement si Symfony déclare `acceptsExistingOfflineVisits:true`.
La présence de la trame ne suffit pas : il faut aussi son affectation au LOCAL.

Le précontrôle MÉTRA vérifie désormais tous les critères, facultatifs compris,
avec le triplet serveur exact et une source locale explicite :
`{cleMetierStable, brancheId, sourceKey}`. Un simple alias/libellé ne constitue
pas une correspondance. Il refuse les capacités serveur non implémentées.

**Côté Symfony :** préciser les clés stables, les versions coexistantes,
les trames attribuées au local, les capacités et les règles de dépréciation.
Le précontrôle est pour le moment pur et offline : aucun endpoint V2 actif.
