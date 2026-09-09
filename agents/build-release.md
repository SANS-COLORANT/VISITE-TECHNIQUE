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
- numérotation visible des builds ;
- reproductibilité des dépendances avec `package-lock.json` et `npm ci` ;
- vérification que l’installation des dépendances ne modifie pas le code runtime versionné.

## Procédure en cas d’échec

1. Identifier l’étape exacte qui échoue.
2. Lire les logs complets du job.
3. Repérer la première erreur significative, pas uniquement la dernière conséquence.
4. Classer la cause : JavaScript, React Native, Gradle, dépendance, environnement CI, Android natif ou packaging.
5. Proposer le correctif minimal.
6. Ne pas modifier la logique métier pour simplement faire passer le build.
7. Ne pas relancer aveuglément le même build sans justification.
8. Si `postinstall` ou un contrat échoue, corriger le vrai fichier source ou le contrat concerné ; ne pas réintroduire un patch automatique qui répare le runtime pendant l’installation.

## Source et packaging

Le build peut générer ce qui appartient réellement au packaging : numéro/versionCode, assets générés, projet Android Expo, configuration de signature et APK. Une transformation qui modifie une fonctionnalité, l’ergonomie, une optimisation runtime, les données ou les exports applicatifs doit être matérialisée dans le code source avant le build et validée par un contrat adapté.

Les scripts historiques de patch runtime ne constituent qu’un chemin explicite de récupération d’un ancien checkout. Ils ne doivent pas être appelés automatiquement par `npm ci`, `postinstall` ou les workflows de release.

## Validation de release

Avant de déclarer un build disponible, vérifier :
- `npm ci` terminé avec le lockfile versionné ;
- vérification du runtime terminée sans mutation de source ;
- APK debug produit si attendu ;
- APK release produit ;
- signature historique METRA vérifiée ;
- artefacts uploadés ;
- numéro de build correct ;
- workflow terminé en succès.
