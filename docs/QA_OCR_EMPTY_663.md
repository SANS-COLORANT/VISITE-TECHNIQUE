# OCR vide après 663 — correction

## Cause confirmée

Le pont `MetraOcrModule.recognizeMeter` divisait la dimension de l'image par `BitmapFactory.Options.inSampleSize` avant de l'initialiser. Sur Android API 34, la valeur par défaut réellement mesurée est **0** : l'appel échouait avant le moteur OCR. Les essais antérieurs invoquaient directement `MeterOcrProcessor` ; ils ne couvraient pas le décodage dans le pont Kotlin.

## Correction

- Décodage partagé `MeterImageDecoder`, valeur initiale 1, réduction bornée à 3200 px, dimensions et fichier contrôlés. Le pont Kotlin appelle explicitement ce décodeur.
- Secours par le lecteur Android ordinaire, toujours embarqué et hors connexion, si le lecteur spécialisé échoue ou ne renvoie aucun texte. Une tentative de secours, sans boucle de relance.
- Une lecture claire de la photo complète peut être proposée même si les améliorations suivantes ne lisent rien. Une lecture isolée de recadrage reste écartée ; les unités endommagées ne sont pas assimilées à une unité valide. Toutes les propositions restent à confirmer.
- Écran relevé et Mode Photo : le texte réellement reconnu est visible quand aucun index fiable n'a pu être extrait. La saisie éditable et la confirmation restent disponibles. Aucun numéro de série n'est utilisé comme repli.

## Tests réellement exécutés

- Compilation complète `:app:assembleDebug` réussie, puis recompilation après ajout du test d'instrumentation.
- Instrumentation de **la vraie classe Kotlin `MetraOcrModule`**, avec `ReactApplicationContext` et `PromiseImpl` : écriture d'un JPEG, URI locale, décodage, rotation EXIF, ML Kit et réponse React Native. Ce test ne remplace pas le pont par un double.
- Trois images témoins créées par Canvas, avec des valeurs distinctes des photos terrain : **3/3 index et unités exacts**, aussi après passage dans le parseur JavaScript. Image blanche : pas d'index inventé. Fichier manquant : erreur explicite, aucune division par zéro.
- Seuils de réduction testés : 2560 et 3200 px → facteur 1 ; 3201 et 6400 → 2 ; 6401 → 4. Dimensions invalides refusées.
- Six photos terrain testées localement par le vrai pont Kotlin : **6/6 renvoient du texte ; 0/6 index complets ; 0 mauvaise proposition acceptée**. Les photos et leurs nouvelles sorties OCR restent locales. Le nouveau fixture publié contient uniquement les témoins synthétiques et le code d'erreur du fichier manquant.
- Absence de réseau vérifiée : `Active default network: none` pendant ces essais Android API 34.
- Tests des secours : lecteur spécialisé en échec, sorties vides, texte présent seulement dans les passes suivantes, erreur du lecteur de secours, plaques/températures et indisponibilité native.
- Régression index : unités, décimales, recadrages tronqués, ambiguïtés et six anciennes erreurs testées. Tests des trois témoins du vrai pont intégrés aux contrats runtime.
- Bundle Android Expo généré ; syntaxe des quatre fichiers JavaScript modifiés vérifiée.
- 36 contrôles des destinations des compteurs réussis avec vraies trames et SQLite ; contrats interface terrain, Mode Photo et isolation Missions réussis.
- Parcours photo sous Windows : les 39 assertions SQLite réussissent, puis le nettoyage temporaire échoue avec `EPERM`, comme avant ce correctif. Aucun test désactivé. Les contrats runtime complets passent ensuite sous Linux dans le build 665.

Le défaut qui empêchait toute lecture est **VALIDÉ comme corrigé** sur ces essais. Le critère plus exigeant « chaque photo donne son index complet avec décimales » reste **BLOQUÉ** sur les six photos terrain ; le retour de texte n'est pas compté comme un index réussi.

## Rejouer le test natif

Après installation des dépendances :

```powershell
npx expo prebuild --platform android --no-install
node .github/scripts/prepare_meter_ocr_android_test.js
Push-Location android
./gradlew.bat :app:assembleDebug
Pop-Location
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am instrument -w com.visitetechnique.tablet/com.metra.missiontools.MeterOcrBridgeInstrumentation
```

Le script prépare uniquement la source et le manifeste **debug** générés pour le test. La release ne contient pas l'instrumentation. Les fixtures enregistrent des résultats réellement obtenus ; après une modification native, rejouer l'instrumentation au lieu de se contenter des fixtures JavaScript.

## APK corrigée

Build **665**, source applicative `e097d1aabf5de44aed8e668a850e22e366b64ceb`, [exécution GitHub](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/37759238535).

Le job `build-apk` réussit : dépendances, contrats runtime, bundle JavaScript, compilation Android debug et release, vérification de signature et publication des deux APK. Les captures de l'interface sont un job distinct.

Fichier livré : `METRA-665-correction-OCR.apk`, 58 139 764 octets. Vérification locale par `aapt` : paquet `com.visitetechnique.tablet`, `versionCode=665`. `apksigner verify --print-certs` réussit ; certificat SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, identique à la signature attendue pour les mises à jour. SHA-256 du fichier APK : `07d74e83cc23c51e49fa28bb7e4a46c87ac84d4153bdab04c875ede95dde3214`.

**VALIDÉ** : correction de l'arrêt avant OCR et retour de texte hors connexion sur les six photos testées. **BLOQUÉ** : index complet avec décimales sur ces mêmes six photos (0/6) ; cette APK ne doit pas être présentée comme une lecture parfaite.
