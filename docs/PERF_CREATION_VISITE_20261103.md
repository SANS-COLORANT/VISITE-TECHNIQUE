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
