# METRA REMAR — audit 141 points, intégrité des saisies et contrat Intranet

**État : branche de correction / PR en brouillon, non déployée.**
Ce document ne vaut pas recette de production sur Symfony. Date de l'audit : 2026-11-02.

## 1. Périmètre et démonstration de correspondances

La trame officielle contient **141 points**, dont **70 contrôles avec avis** (S, N.S, N.R, S.O, N.V) et **71 champs de saisie**. Une destination Excel unique et une clé de stockage SQLite distincte sont déclarées pour chaque point. Les libellés seuls **ne sont jamais des identifiants** ; par exemple « GTB », « Soufflage », « Situation », « Réseau 1 » sont réutilisés dans plusieurs rubriques.

| Panneau | Points | Vérification |
|---|---:|---|
| Informations | 14 | Saisie et correspondances exactes |
| Réseaux chauffage | 5 | Noms des cinq réseaux, rejet des données complémentaires non représentables |
| Conformité local | 17 | Avis + commentaires |
| Conformité chauffage | 7 | Avis + commentaires |
| Conformité ECS | 7 | Avis + commentaires |
| Distribution | 10 | Chauffage et ECS séparés |
| Compteurs / températures | 9 | Cellules officielles, relevés dynamiques et annexe de provenance |
| Améliorations chauffage | 6 | Avis + commentaires |
| CTA | 13 | Année, identité, champs techniques, avis |
| Filtration CTA | 6 | Trois filtres officiels, classe et état |
| Mesures CTA | 9 | Températures, vitesses, consignes |
| Améliorations CTA | 6 | Avis + commentaires |
| VMC | 22 | Contrôles par caisson et répartition |
| Production de froid | 10 | Réseaux et champs spécifiques |

**Vérifications automatiques nouvelles :**
- `.github/scripts/test_remar_141_intranet_matrix.js` exécute le vrai moteur de critères avec **141 destinations simulées** et compare chaque valeur/avis/commentaire au résultat : les **70 contrôles** passent chacun par les **cinq avis**, avec vérification des commentaires.
- `tests/trameRemar.test.mjs` vérifie l'export Excel natif, la réimportation SQLite, les anciens classeurs « REMAR CLASSIQUE », le cas réel à **2 CTA, 2 filtres, 2 mesures, VMC, froid, température héritée**, un enregistrement contradictoire refusé, et l'intégrité des clés étrangères.
- Les suites historiques `test_intranet_visit_upload*.js`, `test_remar*.js`, `test_reseau_chaleur_carry_forward.js` et le contrôle A2/80+1 matériels sont relancés en CI.
- Ces essais n'utilisent **pas** de vrai compte Symfony ; ils **ne prouvent pas** l'exactitude d'un export obtenu par GET/POST/GET sur le serveur actuel.

## 2. Causes racines et correctifs dans METRA

### 2.1. Champs plats anciens et nouvelles fiches dynamiques

Les champs de l'ancien formulaire REMAR sont stockés dans `champs_visite` ou `controles_visite`, tandis que les CTA/VMC/froid du nouveau formulaire sont dans `remar_values`, rattachées à des IDs de patrimoine. Avant correction, une ancienne valeur pouvait réapparaître lorsqu'une nouvelle fiche dynamique existait mais ne portait plus cette donnée.

Correction : `remarDynamicOwnsMapping()` définit une source d'autorité commune à Excel et Intranet, **uniquement pour la famille dynamique concernée**. Une donnée courante vide ne reprend pas silencieusement une ancienne donnée fixe ; les autres trames restent sur leurs chemins existants. La provenance « Historique à confirmer » n'est pas présentée comme une vérification de la visite courante.

### 2.2. Réseaux et compteurs REMAR

L'Intranet V1 REMAR présente cinq destinations de noms « Réseau 1 » à « Réseau 5 », pas les catégories réseau détaillées ICPE/RCU. Le moteur pouvait donc chercher des catégories absentes et bloquer ou omettre des valeurs.

Correction : sérialisation par destination unique pour ces cinq noms, avec effacement contrôlé des noms hérités en Excel ; rejet explicite d'un sixième réseau ou de paramètres de courbe, TNC, programmation, températures qui ne tiennent pas dans les champs V1. Un compteur nommé `supplementaire`, dont la destination est inconnue ou ambiguë, ne disparaît plus silencieusement du POST : **il empêche l'envoi, sans effacer le relevé**. Les compteurs courants prennent le pas sur les anciennes valeurs de cellules figées.

### 2.3. Plusieurs CTA/VMC/froid

Le classeur officiel REMAR est à cases uniques, tandis que METRA autorise plusieurs instances et enfants. Le choix d'une « CTA de référence Excel » sert à présenter le classeur : ce choix **ne convertit pas** les CTA supplémentaires en données V1 transmissibles.

Correction : toutes les instances, leurs contrôles et enfants, sont conservés dans `REMAR_DETAIL`, et le classeur officiel conserve ses 141 destinations. Les conflits d'écriture vers une même cellule déclenchent un avertissement ; les champs dynamiques non reconnus, mesures complémentaires, observations additionnelles et filtres au-delà du format sont identifiés. La protection pré-envoi reste bloquante tant que Symfony ne sait pas conserver chaque objet.

### 2.4. Import Excel `REMAR_DETAIL` manquant

L'import Excel utilisait les 141 cellules fixes, mais ignorait l'annexe des CTA, enfants et températures : un export puis réimport pouvait détruire le détail multi-instance.

Correction : `remarExcelDetail.js` analyse l'annexe et crée les fiches et constats dans une transaction SQLite, en résolvant les identités du local, en interdisant les doublons contradictoires et en conservant les unités et la provenance. Les anciennes annexes d'avant l'ajout de la colonne `Unité` restent admises. L'Excel ne contient toutefois pas les fichiers binaires des photos ; ceux-ci restent gérés par les flux de sauvegarde/photos dédiés.

### 2.5. Diagnostic peu exploitable

L'alerte n'affichait que sept messages malgré 41 erreurs. Un bouton permet de **partager la liste intégrale numérotée**, sans supprimer les contrôles de blocage.

## 3. Limite serveur : **non corrigée dans cette PR**

Les API Symfony V2 présentées dans `docs/CONTRAT_GLOBAL_INTRANET_V2.md` sont **des propositions**, pas des routes actives vérifiées.

Le POST actuel `/api/clients/{id}/visites` sait transporter des commentaires texte multiligne pour un même critère, mais ne fournit pas de modèle structuré à plusieurs CTA indépendantes, avec filtres, contrôles et mesures interrogeables par ID. De plus, le serveur V1 réécrit le listing matériel complet de façon destructive. **Sans adaptation du serveur, on ne peut pas garantir l'envoi sans perte**. Aucun correctif ne doit inventer des ID de critères, se contenter d'une CTA référente en omettant les autres, ou ignorer le contrôle A2.

### Exigences à implémenter et valider côté Symfony

1. Publier la description **versionnée par trame et par local**, avec IDs métier stables et capacités explicites, sans renommer les critères V1 existants.
2. Recevoir une **collection** `equipements[]` contenant `equipementId`, `famille` (CTA/VMC/froid), `localId`, `visiteId`, `nom`, ainsi que des `composants[]` (filtres, mesures, réseaux) avec `parentId`, ordre, unité, champ, avis, commentaire, provenance et confirmation du jour. Les enfants de deux CTA ne doivent jamais être mélangés.
3. Prévoir une **prévalidation sans écriture** : donnée reçue / destination / résultat (`mappé`, `conservé comme complément`, `non représentable`) et codes d'erreur détaillés avant le POST réel.
4. Conserver la sémantique des cinq avis ; `null`, `N.V`, `N.R`, `S.O`, absence, valeur héritée et effacement sont distincts.
5. Faire des mutations de patrimoine par **ID et version** (pas de remplacement complet d'une liste lors d'un simple ajout), avec transaction et concurrence optimiste ou verrou approprié.
6. Rendre les écritures **idempotentes** par ID d'envoi et corps figé. Gérer coupure réseau, reprise, 409 conflit, 422 validation, et photos séparées sans doublons.
7. Exposer un **GET** de restitution structurée du même local/visite, puis s'assurer que le réexport Excel officiel **et** une annexe multi-instance reproduisent à l'identique les données avant envoi.
8. Conserver les anciennes visites, sauvegardes SQLite et trames V1. Activer le nouveau contrat **uniquement si le serveur annonce et démontre** la capacité, sans migration destructrice.
9. Tester au minimum : 0/1/2/3 CTA, 4 filtres sur une CTA, 2 VMC de même type, 2 réseaux froid, mesures N.R et N.S, relevés gaz et compteur supplémentaire, 6 réseaux de chauffage, données héritées non confirmées, 28 matériels A2 puis 81 lignes en réponse, données concurrentes de deux tablettes, photos contextualisées et historiques.
10. Lancer une campagne **METRA → Symfony → GET → Excel réexporté depuis Symfony**, comparer par ID *toutes* les données et prouver **zéro champ perdu, zéro matériel dupliqué, zéro photo déplacée** avant autorisation terrain.

## 4. Décision de déploiement

- **GO limité** aux corrections locales dont la CI, les sauvegardes et les exports sont validés.
- **NO-GO production tant que le serveur n'a pas confirmé un POST/GET conservant les textes multilignes, les 41 erreurs réelles n'ont pas été recoupées et les protections d'inventaire A2 n'ont pas été vérifiées.** Le regroupement permet un envoi V1 textuel des CTA multiples, mais ne transforme pas les chaînes reçues en fiches Symfony indépendantes.
- **Pas de publication d'APK natif sur cette PR en brouillon.** Un bundle JavaScript et des tests SQLite/Excel ne remplacent pas un build Android natif signé, un démarrage sur tablette et une recette terrain.

## 5. Décision métier confirmée — regroupement par saut de ligne

Les destinations Symfony V1 qui sont des **champs texte** peuvent désormais recevoir plusieurs observations homogènes sans créer un critère distant supplémentaire. Pour un couple catégorie/sous-catégorie/critère, les saisies sont regroupées dans **un seul `commentaire`**, en séparant chaque objet par une nouvelle ligne. Exemple :

```text
Compteur Gaz A : 1222 m³
Compteur Gaz B : 2588899 m³
```

- **Compteurs :** la destination explicite fait autorité. Si elle indique « supplémentaire » ou manque, le nom **et** l'unité doivent identifier sans ambiguïté gaz (m³), énergie (MWh), ECS (m³) ou appoint (m³) avant regroupement. Sinon la visite est bloquée afin de ne pas confondre gaz, ECS et appoint.
- **CTA/VMC/froid :** chaque année, état, équipement, filtre, mesure ou avis qui a une destination officielle est préfixé par sa fiche (ex. `CTA bureaux : 2019` et `CTA gymnase : 2025`). L'identité propre est toujours conservée dans SQLite et l'annexe Excel. Une CTA supplémentaire n'est plus un motif de blocage automatique si ses données sont regroupables.
- **Contrôles S/N.S/N.R/S.O/N.V :** la case d'avis Symfony est une **synthèse conservatrice** (`N.S` si au moins un élément est N.S, puis N.R, N.V, S ou S.O par ordre de priorité) ; chaque ligne de commentaire garde explicitement son avis original et son constat. Une CTA sans avis confirmé ne prend jamais automatiquement l'avis d'une autre CTA.
- **Réseaux REMAR :** les réseaux 6+ sont listés dans la cinquième case, avec leur nom/numéro ; les températures, la courbe de chauffe, TNC et la consigne qui existent sont écrites à la suite sous forme de lignes identifiées.
- **Limite :** le serveur V1 impose au maximum **1500 caractères** par commentaire : l'envoi est refusé s'il dépasse, sans troncature ni suppression silencieuse. Une mesure supplémentaire sans famille/destination certaine reste bloquée jusqu'au choix de cette destination.

**Différence importante entre « valeurs visibles » et « modèle de données structuré » :** Symfony V1 reçoit un texte lisible, pas des fiches CTA/VMC indépendantes interrogeables par leurs IDs. Le regroupement répond au choix d'interopérabilité de terrain, **mais ne garantit pas** la reconstitution de tous les liens équipements/photos/dates après un export purement Symfony. Une future API multi-instance demeure souhaitable, et une recette authentifiée `POST → GET → réexport` est nécessaire pour confirmer le maintien exact des sauts de ligne et caractères accentués.
