# Instructions des agents — METRA

Tout agent IA intervenant dans ce dépôt doit respecter les règles de ce fichier et lire les documents du dossier `docs/` correspondant à son domaine.

## Références obligatoires

- `docs/METRA_RULES.md`
- `docs/DATA_MODEL.md`
- `docs/TRAMES.md`
- `docs/REPORTS.md`
- `docs/ANDROID_ARCHITECTURE.md`
- `docs/MISSIONS.md`
- `docs/DESIGN_SYSTEM.md` (direction artistique validée : toute interface doit la suivre)

Les rôles spécialisés sont décrits dans `agents/`.

## Règles non négociables

1. Patrimoine partagé et informations techniques maillées par concepts canoniques entre les trames du même local ; chaque valeur conserve sa provenance de visite.
2. Les réserves non levées suivent le local entre les trames jusqu’à leur levée/annulation ; photos et conclusions restent historiques.
3. Équipements patrimoniaux partagés mais filtrés selon l’applicabilité de la trame.
4. Les contrôles restent définis par chaque trame, mais un concept équivalent peut recevoir la dernière valeur connue provenant d’une autre trame.
5. Un avis satisfaisant peut et doit proposer un commentaire positif.
6. Une nouvelle visite ICPE, VMC ou Réseau de chaleur reprend par défaut les dernières valeurs compatibles du même local, toutes trames techniques confondues, via le maillage sémantique : champs, mesures, réseaux/compteurs, avis, commentaires de contrôle et réserves non levées, comme données de préremplissage immédiatement modifiables. Pré-allumage ne reprend que les informations durables explicitement prévues et laisse les contrôles à refaire vides. Les réserves terminées/annulées, photos et conclusions historiques restent uniquement dans l’historique.
7. L’application doit rester utilisable hors connexion.
8. Une modification d’une trame ne doit pas casser les autres.
9. Le module Missions est strictement indépendant de l'Intranet et reste désactivé par défaut derrière le verrou LAB défini dans `docs/MISSIONS.md`.
10. Une visite Mission peut rester partiellement renseignée et doit pouvoir être reprise après fermeture sans perte.
11. Développer sur une branche dédiée et ouvrir une PR vers `native-android`.
12. Ne jamais considérer un bundle JavaScript réussi comme une compilation Android réussie.
13. Le code runtime versionné est la source de vérité : ne jamais ajouter dans `postinstall` ou dans la CI un patch automatique qui modifie silencieusement une fonctionnalité, l’ergonomie, les performances ou une règle métier. Modifier le vrai fichier source et son contrat de validation dans une PR dédiée.

## Avant toute modification

- identifier le rôle principal concerné dans `agents/` ;
- identifier les impacts sur ICPE, VMC et Pré-allumage ;
- pour Missions, vérifier explicitement qu'aucune dépendance Intranet n'est introduite ;
- vérifier si SQLite, Excel, PDF/Word ou Android natif sont touchés ;
- limiter le changement au périmètre demandé ;
- distinguer explicitement une génération de packaging légitime d’une mutation du code runtime qui doit être matérialisée dans Git.

## Avant fusion

Appliquer la matrice de `agents/qa.md` et documenter les tests réellement exécutés. Pour un changement de build, vérifier également que `npm ci` et `postinstall` n’altèrent pas le code runtime versionné.