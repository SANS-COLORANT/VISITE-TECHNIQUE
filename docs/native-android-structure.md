# Organisation de la branche native-android

La branche historique contient encore plusieurs modules a la racine. Le rangement est fait progressivement afin de ne pas casser les builds Android en cours.

## Cible

```text
features/
  lab3d/
  hydraulic/
  branding/
  visites/
    icpe/
    vmc/
    pre-allumage/
  patrimoine/
  reports/
  sites/
database/
  migrations/
assets/
  branding/
  lab3d/
  report/
visual-packs/
.github/
  workflows/
  scripts/
```

## Regles

1. Une fonctionnalite majeure possede son propre dossier.
2. Les donnees permanentes des equipements restent rattachees au site.
3. Les migrations SQLite restent centralisees dans `database/migrations`.
4. Les assets sont classes par usage, sans duplication physique inutile dans l'historique Git.
5. Pendant la transition, de petits fichiers de re-export restent a la racine pour garantir la compatibilite avec les imports historiques et les scripts de build.
6. Aucun rangement n'est fusionne dans `native-android` avant validation Expo/bundle et APK.
