# METRA — Accélération de création de visite (03/11/2026)

## Causes concrètes
1. `copyLatestSameTrameVisit` effectuait une écriture SQLite **pour chaque champ, chaque contrôle et chaque observation REMAR**, plus une lecture d'appartenance pour chaque CTA/filtre.
2. `collectSemanticSnapshot` lisait les champs et avis par **ancienne visite** (2 requêtes pour chaque historique) et `copyUnresolvedReserves` cherchait les réserves et tombstones à l'unité.
3. `SiteVisitesScreen.nouvelleVisite` attendait encore un `prewarmVisit(visiteId, true)` complet **après** la création, avant même de naviguer.

## Optimisations
- Remplacement des boucles d'écritures par **5 SQL groupés** par copie : champs hors métadonnées actuelles, contrôles (S/N.S/S.O/N.R/N.V + commentaires), REMAR (CTA, filtres, caissons, valeurs, origine), note libre et marqueur idempotent. Transaction unique, vérification `installation_id` des propriétaires d'objets.
- Parcours historique en paquets de 120 visites, lecture groupée des champs/contrôles, index sémantique mis en cache par trame. Valeur la plus récente toujours prioritaire, sans plafonner le nombre de visites ni écarter les autres trames.
- Réserves historiques lues par lots. Les retraits `retrait_visite`, réserves levées/annulées, lignée de réserve et déduplication sont strictement conservés.
- Navigation vers l'écran Visite **dès que tous les préremplissages obligatoires sont terminés**. Suppression uniquement de l'attente d'un deuxième préchargement de caches déjà pris en charge par `VisiteScreen`. Aucune donnée n'est copiée en tâche de fond et aucune date ni identité Intranet précédente n'est réutilisée.
- Aucun changement graphique, aucune modification des APIs Symfony, aucune altération des fichiers photo, réserves ou trames.

## Tests / critères de GO
- `test_visit_creation_fast_sqlite.js` : vrai SQLite, 401 champs, 300 avis couvrant les 5 statuts, deux observations REMAR dont un filtre, méta/date de visite inchangées, isolation des locaux, origine, idempotence. Maximum 5 mutations SQL.
- `test_visit_history_batch_performance.js` : 250 anciennes visites, lectures groupées, dernier avis conservé, historique de réserves fermées, retirées et existantes sans duplication.
- Toutes les suites `npm run verify:metra`, REMAR 141 critères, ICPE / VMC / RCU / Pré-allumage, Intranet V2, rapports et Android doivent rester vertes.
- Pas d'engagement de temps absolu sans mesure sur la tablette physique. Un `GET` Symfony pour une trame différente de celle du local reste nécessaire à l'identité métier et peut rallonger un nouveau dossier si Internet est lent.

## Deuxième passe — préparation réseau, matériels et dernières lectures

Constat : le build natif #835 a passé sa CI mais la création peut encore être lente
à cause de l'attente d'un GET Symfony de trame différente de la trame du local,
de la réconciliation du matériel existant et des requêtes historiques restantes.

- **Préchargement volontaire et non persistant** de la préparation de trame
  sélectionnée pendant l'ouverture du choix de visite ; le résultat du GET
  validé est réutilisable une seule fois, pendant **45 secondes maximum**,
  uniquement pour le même client/local/trame Symfony et trame METRA.
  Aucun cache serveur global n'est remplacé, aucune création de visite anticipée.
  Toute erreur de validation reste bloquante pour la création.
- **Listing matériel Intranet** : une recherche SQL groupée des identifiants
  distants de matériel par paquets de 120 remplace autant de recherches
  unitaires. La priorité matériel du même local, puis dernière provenance,
  reste identique ; un matériel changé continue d'être réimporté.
- **Attributs matériel** : jusqu'à six mises à jour par équipement sont
  remplacées par une requête SQL multi-valeurs, sans toucher aux valeurs
  existantes si elles sont identiques. L'historique du matériel de chaque
  visite n'est pas réécrit.
- **Préremplissage permanent** : les valeurs persistantes sont lues une
  fois au lieu d'une requête par champ. Les champs temporaires restent exclus.
- **Anciennes mesures réseaux/compteurs** : recherche de la visite source
  par lots bornés, sans changer la priorité chronologique.
- **Diagnostic durée** : `creerVisiteProduction` journalise les durées
  de chacune des étapes lorsqu'une création dépasse 350 ms, sans client,
  adresse, équipement, identifiant ou valeur de saisie.

Tests de non-régression ajoutés :
`test_intranet_selected_trame.js` (partage de promesse, sécurité identité,
consommation unique), `test_visit_creation_intranet_materials_fast.js`
(80 matériels, 480 attributs, zéro doublon et changement de matériel),
`test_visit_prefill_single_read.js` (230 anciens champs, 150 durables),
`test_visit_history_batch_performance.js` (priorité des derniers compteurs
et réseaux), plus matrice globale REMAR/Intranet et APK natif.

**Limites :** un GET Symfony peut toujours être nécessaire si la trame est
changée au dernier moment ou si la préparation préchargée a expiré ;
son résultat doit rester validé. La rapidité ressentie n'est pas démontrée
tant que les durées sur la tablette réelle n'ont pas été comparées.
