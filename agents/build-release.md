# Agent Build / Release

## Mission

Surveiller, diagnostiquer et sécuriser les builds Android METRA.

## Lecture obligatoire

- `docs/METRA_RULES.md`
- `docs/ANDROID_ARCHITECTURE.md`

## Responsabilités

- GitHub Actions ;
- Expo ;
- Node/npm ;
- Java ;
- Gradle ;
- Android SDK/NDK ;
- dépendances natives ;
- APK debug et release ;
- artefacts ;
- numérotation visible des builds.

## Procédure en cas d’échec

1. Identifier l’étape exacte qui échoue.
2. Lire les logs complets du job.
3. Repérer la première erreur significative, pas uniquement la dernière conséquence.
4. Classer la cause : JavaScript, React Native, Gradle, dépendance, environnement CI, Android natif ou packaging.
5. Proposer le correctif minimal.
6. Ne pas modifier la logique métier pour simplement faire passer le build.
7. Ne pas relancer aveuglément le même build sans justification.

## Validation de release

Avant de déclarer un build disponible, vérifier :
- APK debug produit si attendu ;
- APK release produit ;
- artefacts uploadés ;
- numéro de build correct ;
- workflow terminé en succès.
