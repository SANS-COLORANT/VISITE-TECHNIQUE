# METRA — Architecture Android

## Objectif terrain

METRA est une application de visite technique sur tablette. Les priorités sont :
1. fonctionnement hors connexion ;
2. rapidité de saisie ;
3. gros contrôles tactiles ;
4. peu de clavier ;
5. sauvegarde robuste ;
6. restitution fidèle des données.

## Séparation des responsabilités

- Les trames définissent les contrôles et leurs règles.
- L’UI décide comment les présenter ergonomiquement.
- La base de données conserve le patrimoine et les observations.
- Les rapports restituent les données sans réinterpréter silencieusement les constats.

## Préremplissage

Peuvent être préremplis automatiquement :
- client ;
- site ;
- adresse ;
- exploitant si patrimonial ;
- date ;
- saison calculée ;
- locaux / SST ;
- équipements applicables ;
- compteurs et unités ;
- valeurs de référence antérieures affichées comme référence.

Ne doivent jamais être validés automatiquement comme données du jour :
- nouvel index compteur ;
- température mesurée ;
- résultat d’un essai ;
- avis du jour.

## Ergonomie de contrôle

Pour un contrôle standard, viser deux actions maximum :
1. choix de l’avis ;
2. choix du constat/preset.

Le commentaire reste éditable.

Une action « Valider les contrôles restants comme satisfaisants » peut exister, mais seulement après action explicite de l’utilisateur et en générant les commentaires positifs adaptés à chaque contrôle.

## Build

Une validation JavaScript réussie ne remplace pas une compilation Android. Les PR touchant aux dépendances ou au natif doivent passer la compilation Gradle avant fusion.

### Source runtime autoritative

Le code runtime versionné dans GitHub est la source de vérité de l’application. Une installation npm ou un build Android ne doit pas reconstruire silencieusement des fonctionnalités, de l’ergonomie, des optimisations ou des règles métier en patchant les fichiers source.

- `postinstall` vérifie l’état source et échoue si un contrat n’est plus respecté ; il ne répare pas les fichiers.
- Une évolution runtime est développée directement dans les fichiers source sur une branche dédiée et accompagnée de contrats/tests adaptés.
- Les anciens patches de source peuvent rester temporairement disponibles uniquement comme outil explicite de récupération d’un ancien checkout ; ils ne doivent jamais être appelés automatiquement par CI.
- Les générations réellement liées au packaging restent autorisées pendant le build : versionCode, assets générés, projet Android issu d’Expo, configuration de signature et artefacts APK.
- Toute mutation de source encore nécessaire dans le workflow APK doit être considérée comme dette technique à matérialiser progressivement, avec validation de non-régression avant suppression du patch.
