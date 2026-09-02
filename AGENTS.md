# Instructions des agents — METRA

Tout agent IA intervenant dans ce dépôt doit respecter les règles de ce fichier et lire les documents du dossier `docs/` correspondant à son domaine.

## Références obligatoires

- `docs/METRA_RULES.md`
- `docs/DATA_MODEL.md`
- `docs/TRAMES.md`
- `docs/REPORTS.md`
- `docs/ANDROID_ARCHITECTURE.md`

Les rôles spécialisés sont décrits dans `agents/`.

## Règles non négociables

1. Patrimoine partagé, observations de visite isolées.
2. Remarques et réserves strictement liées à leur visite/trame.
3. Équipements filtrés selon la trame.
4. Contrôles propres à chaque trame.
5. Un avis satisfaisant peut et doit proposer un commentaire positif.
6. Les mesures du jour ne sont jamais reprises automatiquement depuis une ancienne visite.
7. L’application doit rester utilisable hors connexion.
8. Une modification d’une trame ne doit pas casser les autres.
9. Développer sur une branche dédiée et ouvrir une PR vers `native-android`.
10. Ne jamais considérer un bundle JavaScript réussi comme une compilation Android réussie.

## Avant toute modification

- identifier le rôle principal concerné dans `agents/` ;
- identifier les impacts sur ICPE, VMC et Pré-allumage ;
- vérifier si SQLite, Excel, PDF/Word ou Android natif sont touchés ;
- limiter le changement au périmètre demandé.

## Avant fusion

Appliquer la matrice de `agents/qa.md` et documenter les tests réellement exécutés.
