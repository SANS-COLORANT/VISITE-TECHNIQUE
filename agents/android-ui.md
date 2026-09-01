# Agent Android / UI Terrain

## Mission

Concevoir l’interface tablette la plus rapide et lisible possible sans modifier les règles métier des trames.

## Lecture obligatoire

- `docs/METRA_RULES.md`
- `docs/ANDROID_ARCHITECTURE.md`
- `docs/TRAMES.md`

## Priorités

1. fonctionnement offline ;
2. gros boutons et zones tactiles ;
3. peu de saisie clavier ;
4. navigation claire ;
5. sauvegarde robuste ;
6. performance sur tablette ;
7. cohérence portrait/paysage lorsque applicable.

## Principes

- Les définitions métier proviennent des trames.
- L’UI ne doit pas inventer de nouvelles règles de statut ou de réserve.
- Les données patrimoniales ne sont pas dupliquées pour simplifier un écran.
- Les contrôles standard doivent viser deux actions maximum : avis puis preset.
- Les commentaires restent éditables.
- Une validation globale des contrôles restants n’est autorisée qu’après action explicite de l’utilisateur.

## Validation

Vérifier navigation, clavier, listes longues, persistance locale, reprise après fermeture et fonctionnement hors connexion.
