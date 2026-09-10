# Photos de référence — parcours terrain

## Périmètre

Cette passe corrige le cache livré dans le build 379 et rapproche les photos
Intranet de leur usage terrain. Les photos historiques ne sont jamais insérées
dans `photos`, les remarques ou les contrôles de la visite. Les exports Excel,
PDF et Word continuent de lire leurs données habituelles.

## Parcours

- La sélection de sites Intranet propose « Inclure les photos des dernières
  visites », avec le volume restant, les fichiers déjà présents et les
  indisponibilités. Le bouton d'import n'engage ce téléchargement que lorsque
  le périmètre est connu. Une liste absente ne signifie pas « zéro photo ».
  L'option peut être désactivée pour importer seulement les données.
- Seuls les sites sélectionnés ET importés avec succès sont mis en file.
  Une sélection vide ne devient jamais « tout le client ».
- La fiche site, la liste de ses visites et la visite en cours ouvrent une
  galerie dans une fenêtre, sans remplacer l'écran de saisie. Pré-allumage
  expose aussi l'accès depuis son local actif.
- La consultation est filtrée avec les identifiants Intranet explicites. Quand
  le local n'est pas relié, l'utilisateur le choisit. Aucun rapprochement par
  nom n'est inventé. Les choix Pré-allumage sont mémorisés par visite/local.
- Une photo peut être récupérée seule après confirmation ; un local ou le
  périmètre affiché peuvent être téléchargés ensemble. Le client complet
  reste une action volontaire depuis sa galerie.
- La visionneuse propose pincement, déplacement, double appui, boutons de zoom,
  image suivante/précédente et glissement horizontal uniquement sans zoom.
  La provenance, la date et le local restent explicites.

## Données et concurrence

`mapLatestVisitPhotos` reconstruit les objets imbriqués du manifeste : enrichir
une copie obtenue par `flattenLatestVisitPhotos` ne met pas à jour la galerie.
Les statuts hors connexion sont contrôlés par l'existence et la taille du
fichier privé, jamais par la seule activation de la tablette.

La migration 032 ajoute `api_photo_files`, `api_visit_photo_references` et
`api_visit_photo_local_choices`, sans modifier les observations terrain.
Les références sont fixées à la création d'une visite quand une liste existe,
ou à sa première consultation ensuite. Une actualisation ne les remplace pas.
Une version différente de l'Intranet peut être consultée explicitement puis
l'utilisateur peut revenir à la référence conservée. Les fichiers d'une
référence précédente restent enregistrés ; supprimer la visite retire son
association mais ne supprime pas les fichiers partagés.

La file de tâches est partagée dans le processus METRA. Un seul lot s'exécute
à la fois, avec trois fichiers au maximum. La fermeture d'une fenêtre ou le
changement d'écran ne l'arrête pas. La pause laisse finir les fichiers déjà
engagés puis arrête la planification ; la reprise ignore les fichiers valides.
Les transactions de cache sont sérialisées, avec transaction exclusive SQLite
quand l'adaptateur la fournit. Les échecs répétés ou les refus d'accès
mettent le lot en pause plutôt que de parcourir tout un client en erreur.

## Limites explicites

- Pas de service Android d'arrière-plan : le maintien des téléchargements
  lorsque le système suspend ou tue METRA n'est pas garanti. Après relancement,
  redemander le périmètre reprend les fichiers manquants ; ceux terminés
  restent enregistrés. La file en mémoire n'est pas une file OS persistante.
- L'API ne fournit pas de checksum/révision. La clé de fichier distingue les
  identifiants, type MIME, taille et dimensions, pas deux contenus différents
  ayant exactement les mêmes métadonnées.
- L'API sert la dernière visite. Une photo ancienne NON téléchargée peut ne
  plus être autorisée par le serveur après changement de dernière visite.
  Le client conserve les anciennes photos locales mais ne promet pas de
  retrouver des archives que le serveur ne fournit plus.
- Il n'existe pas de lien explicite photo/réserve/critère dans ce contrat API.
  Le filtrage garanti est client/site/local/visite, pas « photo de cette réserve ».

## QA réalisée

`node .github/scripts/test_photo_workflow.js` exécute les fonctions de production
avec une vraie base SQLite (adaptateur Python standard), un stockage de fichiers
simulé et un transport HTTP simulé. Ce n'est pas un test sur tablette.

39 vérifications : migration existante 31 vers 32, base neuve et idempotence,
structure imbriquée/correction du cache, fichiers manquants, filtrage site/local,
refus client incohérent, reprise sans doublons, limite de trois, attente 429,
conservation d'une référence quand la dernière visite n'a plus de photos,
versions de fichier, choix Pré-allumage distincts, isolation ICPE/VMC/Pré-allumage,
fermeture/réouverture SQLite, erreurs MIME/taille/stockage/chemin, espace disque,
double appui, fermeture du suivi, pause/reprise, suppression d'une visite et FK.

Ces tests font partie de `npm run verify:metra`, sans mutation du code source.
Les passes de compatibilité historiques de l'APK ont aussi été rejouées sur
une copie. Leur adaptateur de navigation conserve l'accès photo déjà présent
dans le vrai composant, sans le générer. La signature de l'APK et la compilation
native restent à contrôler dans GitHub Actions ; le contrôle JSX n'est pas une
compilation Android.

**Statut QA local : VALIDÉ pour les tests automatisés ci-dessus.**
La recette tactile sur tablette et l'essai avec les données réelles restent
à faire : mode avion, retour exact à la saisie, local Pré-allumage, zoom,
téléchargement interrompu et reprise après relancement de METRA.
