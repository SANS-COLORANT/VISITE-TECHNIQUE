# OCR hors connexion : candidats évalués et conservation des lectures

Le critère demandé reste un index complet exact, avec ses décimales, obtenu à partir d’une seule photo. Le retour de texte ou de chiffres partiels ne suffit pas. Le choix retenu est gratuit, entièrement embarqué et sans clé de service.

## Modification applicative

Une erreur ou un dépassement de délai pendant un recadrage, une binarisation ou une passe de contraste pouvait annuler les résultats déjà obtenus. `MeterOcrProcessor` conserve maintenant ces résultats et interrompt les améliorations facultatives. Une erreur de la lecture initiale reste propagée au mécanisme de secours existant.

Les attentes natives utilisent le temps restant d’un budget mesuré par l’horloge monotone Android, plafonné à 8 secondes pour la lecture initiale et 5 secondes par amélioration. Une intersection de recadrage vide est ignorée. Les ressources de recadrage sont libérées même si leur préparation échoue. Aucun seuil métier, unité, décimale ou index de référence n’est ajouté au runtime.

Une passe de contraste peut aussi transformer une unité LCD en un petit nombre accolé à « Wh ». Le parseur compare maintenant la géométrie avec les grandes lignes numériques des autres passes : un petit fragment situé juste sous les chiffres principaux ne devient plus un index distinct. Il ne reconstruit pas les chiffres ou la décimale manquants. Les tests utilisent d’autres nombres synthétiques et conservent la lecture d’un véritable petit index.

Le correctif concerne l’OCR natif, son parseur et le packaging de ses tests debug. Aucune modification de trame ICPE, VMC ou Pré-allumage, de migration SQLite, d’export ou d’interface Missions ; aucune dépendance Intranet supplémentaire.

## Comparaison réellement exécutée

Trois photos fournies par l’utilisateur ont été évaluées localement. Elles présentent notamment des reflets, du moiré et des décimales de petite taille. Les fichiers et les sorties brutes restent locaux ; seuls les résultats agrégés sont publiés.

| Reconnaisseur | Exécution réalisée | Index complets exacts |
| --- | --- | --- |
| ML Kit embarqué actuel | Vrai pont Kotlin sur Android API 34 | 0/3 |
| RapidOCR / PP-OCRv4 | CPU, photo entière et régions redressées | 0/3 |
| PP-OCRv5 mobile anglais ONNX | CPU, même protocole de recadrage | 0/3 |
| Tinnci/anshin CRNN + LightSVTR | CPU, 162 variantes au total | 0/3 pour chaque modèle |
| Seven-segment-ocr TFLite float16 | Android, 81 variantes, Select TF Ops 2.16.1 | 0/3 |
| OICWS CRNN v1.1.0 | CPU, 108 variantes | 0/3 |

Les recadrages de ce protocole proviennent de la plus haute ligne OCR contenant plusieurs chiffres, après exclusion de références techniques évidentes ; les variantes changent les marges et le traitement d’image. Ce comparatif mesure ces pipelines précis, pas le meilleur résultat théoriquement possible après entraînement ou réglage. Le détecteur YOLO d’OICWS n’a pas été évalué. Les modèles ONNX et PyTorch n’ont pas été exécutés dans METRA ; le modèle TFLite a été testé dans un banc Android indépendant.

Les modèles comparés ne sont pas intégrés à l’application : aucun ne passe le critère des trois lectures complètes. Les dépôts Tinnci/anshin et seven-segment-ocr ne fournissent pas de licence explicite repérée pour redistribuer leurs poids. OICWS annonce un code AGPL-3.0 et des poids CC BY 4.0. Aucune de ces dépendances n’est ajoutée au build.

Sources primaires : [RapidOCR](https://github.com/RapidAI/RapidOCR), [anshin](https://github.com/Tinnci/anshin/tree/main/seven_segment_ocr), [seven-segment-ocr](https://github.com/renjithsasidharan/seven-segment-ocr), [OICWS](https://github.com/OICWS/lcd-digit-recognition).

[SSOCR](https://github.com/auerswal/ssocr) et [AI-on-the-edge-device](https://github.com/jomjol/neural-network-digital-counter-readout) restent des pistes documentées, non exécutées dans ce comparatif. Le SDK commercial Anyline est écarté conformément au choix gratuit et hors connexion de l’utilisateur.

## Validation du correctif

- Bundle Android Expo/Hermes généré après modification du parseur (1 347 modules).
- Compilation Android complète `:app:assembleDebug --offline` réussie, Gradle 8.8.
- `MeterOcrEnhancementInstrumentation` exécutée sur Android API 34 : erreurs et délais injectés aux quatre étapes facultatives, huit scénarios ; les résultats précédents sont conservés et la passe échouée n’est pas relancée.
- Budget trop court pour les améliorations : lecture initiale conservée. Erreur initiale : toujours propagée. L’image fournie par l’appelant n’est pas recyclée par le processeur.
- Vrai pont Kotlin rejoué sur les trois nouvelles photos : texte disponible sur 3/3 ; index complets exacts 0/3 ; mauvaises propositions après le nouveau garde-fou 0/3. Trois témoins synthétiques : index/unités exacts 3/3 jusqu’au parseur ; image blanche et fichier manquant correctement traités.
- Réseau de l’émulateur : `Active default network: none`.
- Régressions JavaScript OCR, pont et secours réussies ; 36 tests des destinations de compteurs réussis avec les trames et SQLite.
- Le vérificateur global Windows s’arrête après les 17 assertions réussies d’identité SITE/LOCAL, à cause du nettoyage d’un répertoire SQLite temporaire (`EPERM`). Ce résultat n’est pas présenté comme une validation globale réussie ; aucun test n’est désactivé.

## Rejouer le test natif

Après le prebuild Android et l’installation des dépendances :

```powershell
node .github/scripts/prepare_meter_ocr_android_test.js
Push-Location android
./gradlew.bat :app:assembleDebug
Pop-Location
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am instrument -w com.visitetechnique.tablet/com.metra.missiontools.MeterOcrEnhancementInstrumentation
adb -s emulator-5554 shell am instrument -w com.visitetechnique.tablet/com.metra.missiontools.MeterOcrBridgeInstrumentation
```

Le script copie uniquement les tests et déclare l’instrumentation dans le source set debug généré. Il ne modifie pas le runtime et ces classes ne sont pas incluses dans une APK release. Le test utilise une image témoin synthétique et le vrai résultat ML Kit ; les erreurs sont injectées dans la boucle de production pour vérifier la conservation des passes.

**VALIDÉ** : conservation des lectures lors d’un échec facultatif et exclusion du fragment d’unité pris pour un index. **BLOQUÉ** : lecture automatique des trois index complets avec leurs décimales ; aucun nouveau moteur gratuit testé n’a encore satisfait ce critère.
