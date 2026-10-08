# OCR compteurs — validation après APK 662

Base exacte : `a3305233676adfa8d348e39a156d905f22e3b235`, run APK 662 `37740595599`.

## Résultat métier : BLOQUÉ

Le critère demandé « une photo donne le bon index complet » n'est pas atteint sur les trois compteurs fournis. Les originaux et leurs reprises photographiées sur écran donnent **0/6 index complets**, malgré les passes locales. La correction refuse ces résultats au lieu de proposer la configuration ou le numéro de série. Ce refus ne constitue pas une lecture réussie.

| Compteur | Index visible attendu | Ancienne proposition erronée |
| --- | --- | --- |
| D2 MULTICAL 601 | 23501.54 MWh | 21015272700, configuration |
| D3 MULTICAL 21 | 07928.519 m³ | 74679398, numéro de série mal reconnu |
| C11 CF 800 | 955.67 MWh | 06067868, numéro de série |

## Correction disponible

- Analyse de la photo originale avant compression pour la capture tablette ; conservation de la photo durable pour la fiche.
- Moteur ML Kit embarqué : orientation EXIF, résolution conservée jusqu'à 3200 px, une photo analysée par recadrages automatiques, agrandissement, contraste et deux seuils locaux. Budget de traitement borné, exécution hors thread UI, libération des images et du recognizer.
- Conservation des lignes, positions et recadrages. Une ligne proche du bord d'un recadrage ne peut pas proposer un nombre amputé de son premier chiffre.
- Aucune substitution de lettres en chiffres, aucun index déduit du numéro de série ou de l'historique. Il faut une valeur numérique et une unité lisible. Plusieurs passes doivent confirmer la proposition ; désaccords refusés.
- Unité incompatible avec le champ : application bloquée et indication de l'unité lue. Lecture ambiguë : champ vide, saisie manuelle disponible.
- Plaques, températures et pressions gardent leur parcours existant. Aucun schéma SQLite, export, trame ou service Intranet modifié.

## Tests exécutés

- Banc Android API 34 avec le vrai `MeterOcrProcessor.java`, ML Kit 16.0.1 embarqué, sur les six images sans réseau : aucune mauvaise proposition acceptée, aucun des six index complet reconnu.
- Trois afficheurs témoins rendus avec une police classique, puis réellement lus par ML Kit : 23501.54 MWh, 07928.519 m³ et 955.67 MWh proposés correctement. Ces témoins ne remplacent pas les photos terrain.
- Sorties natives et empreintes SHA-256 conservées dans `.github/scripts/fixtures/meter-ocr-android-captures.json`. Photos non publiées.
- `node .github/scripts/test_meter_ocr.js` : filtres, décimales, unités, ambiguïtés, fenêtres tronquées et témoins natifs.
- `node .github/scripts/test_meter_ocr.js --require-exact-photos` : **échec attendu**, bloque explicitement le critère de lecture des six photos réelles.
- `:app:compileDebugKotlin` dans le projet Android complet : compilation réussie. Ce résultat n'est pas une compilation release signée.
- `expo export --platform android` : bundle généré.
- Régressions destinations compteurs : 36 contrôles SQLite réussis ; parcours photo : 39 assertions réussies ; contrat Mode Photo réussi.
- `npm ci` / `verify:metra` sous Windows : échec du nettoyage de dossier temporaire avec EPERM après les 17 assertions SQLite SITE/LOCAL réussies. Même échec après les 39 assertions du parcours photo. Aucun test n'a été désactivé ni modifié pour masquer ces échecs. Validation Linux nécessaire.
- Serveur GitHub Actions Linux, run 663 `37750920918` : installation `npm ci` avec postinstall, validation Expo et contrats runtime finaux réussis. Le blocage EPERM est propre au nettoyage des tests sous Windows.
- Réexécution des neuf essais sans connexion, `dumpsys connectivity` indiquant `Active default network: none` : six abstentions terrain et trois témoins exacts, mêmes résultats.

Un essai séparé de Tesseract4Android 4.9.0 avec modèles `ssd_int` et `7seg` retrouve parfois la suite de chiffres mais perd la décimale et propose aussi des suites incorrectes à forte confiance. Il n'est pas intégré au produit. Le prototype de lecture directe des segments ne généralise pas suffisamment ; il n'est pas intégré non plus.

## Livraison

Branche dédiée basée sur la 662, PR en brouillon vers `native-android`. Ne pas fusionner ou annoncer un OCR parfait tant que le critère des photos réelles échoue. Un APK de validation éventuel sert à vérifier la correction des fausses propositions, sans certifier la lecture automatique complète.
