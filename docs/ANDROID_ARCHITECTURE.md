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
