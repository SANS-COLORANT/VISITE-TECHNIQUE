# METRA — Audit de préparation Google Play

**Date :** 20 novembre 2026  
**Périmètre :** `SANS-COLORANT/VISITE-TECHNIQUE`, branche `release/metra-playstore-secure-20261120`  
**Statut : BLOQUÉ POUR PUBLICATION**, APK de validation uniquement.  
**Méthode :** inspection du code GitHub, vérification des workflows, examen statique du véritable APK, contrôle des exigences officielles Google Play. Pas de connexion à la console Play, au backend de production ni à une tablette physique.

> Ce rapport est destiné au dépôt public. Aucun secret, jeton, code d'activation, valeur trouvée dans l'historique, photo client ni résultat brut d'un scanner de secrets n'y figure.

## Verdict synthétique

| Domaine | État | Preuve / réserve |
|---|---|---|
| Native Android API 36 | **VÉRIFIÉ SUR APK TEST** | Compilation Gradle réussie sur [run #44715247848](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44715247848). |
| Package Android | **VÉRIFIÉ** | `com.visitetechnique.tablet`. |
| Android 16 et pages ELF 16 Kio | **VÉRIFICATION STATIQUE FAVORABLE** | 64 bibliothèques natives inspectées, segments 64 bits alignés sur 16 Kio et entrées ZIP .so alignées. Un essai sur appareil 16 Kio reste requis. |
| Secrets dans l'APK de test | **AUCUN INDICATEUR COURANT DÉTECTÉ** | Pas de .env, base préremplie, keystore ni motif de jeton/clé courant. Ce scan ne constitue pas une garantie absolue. |
| Historique Git public | **ALERTE À QUALIFIER** | Gitleaks, historique complet : 4 occurrences de type `generic-api-key`, dans `networkProgramming.js` (1) et `features/` (3), **sans divulgation de leurs valeurs**. [Audit #44718118585](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44718118585). |
| Dépendances de production | **ÉCHEC SÉCURITÉ** | `npm audit --omit=dev` : 16 alertes, dont 4 élevées (`xlsx`, `postcss`, `image-size`, `brace-expansion`). Certaines concernent l'outillage et non forcément le code embarqué. |
| Tests métier ICPE / REMAR / Missions / Intranet | **SUITES PRINCIPALES VALIDÉES** | [REMAR #44716719256](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44716719256), [Missions #44716719224](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44716719224), [Intranet V2 #44716719242](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44716719242). |
| AAB officiel | **ABSENT** | Les secrets de clé de téléversement Play ne sont pas configurés ; la génération est volontairement refusée. |
| Politique de confidentialité | **À TERMINER** | Brouillon disponible dans `docs/METRA_CONFIDENTIALITE_PROJET_20261120.md`, mais aucun lien public dédié METRA confirmé dans l'application. |
| Chiffrement local des données métier | **À TRAITER** | Base SQLite ouverte sans chiffrement applicatif ; photos et exports locaux à analyser. |
| Contrôle dynamique sur tablette | **NON RÉALISÉ** | Pas d'essai physique / de test d'upgrade sans perte / de vérification Intranet réelle. |
| Dépôt GitHub | **PUBLIC** | Documents, captures, ressources et ancien historique à examiner pour confidentialité métier et droits d'exploitation. |

## 1. Analyse statique de l'APK natif

- Archive de test : [METRA-Android16-QA-10](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44715247848/artifacts/14618839389), et build de validation suivant [METRA-Android16-QA-11](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44716712610/artifacts/14620865886).
- Version du premier APK contrôlé : versionName `1.0.0`, versionCode `1795169024` ; APK signé avec la **clé historique de débogage**, pas une clé de téléversement Play.
- `targetSdkVersion=36`, `minSdkVersion=24`, `compileSdkVersion=36`.
- Contrôle de `apksigner` réussi et identité package conservée.
- `android:allowBackup=false` et `android:usesCleartextTraffic=false` présents.
- Aucune permission GPS ou accès général à la photothèque.
- `android.permission.CAMERA` et `INTERNET` présents pour les opérations terrain.
- Autres permissions à justifier : `SYSTEM_ALERT_WINDOW`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, et `USE_BIOMETRIC` / `USE_FINGERPRINT` avant soumission.
- **Écart fonctionnel** : le module natif Missions gère la dictée et demande `RECORD_AUDIO`, mais cette permission est absente du manifeste du binaire contrôlé. Tester/réconcilier `microphonePermission=false` et le plugin Missions. Ne pas promettre la dictée dans la fiche avant correction.
- Examiner l'exposition de l'activité de rognage photo `com.canhub.cropper.CropImageActivity` déclarée exportée dans le manifeste fusionné ; vérifier si elle doit être ouverte aux applications tierces.
- 16 bibliothèques `.so` arm64 et 16 x86_64 inspectées, toutes à alignement ELF de 16 Kio ; le test sur un appareil Android réel configuré 16 Kio reste obligatoire.

## 2. Données privées / accès aux serveurs

- `symfonyApi.js` : requêtes HTTPS, jeton de rafraîchissement dans `expo-secure-store`, jeton d'accès en mémoire, preuve DPoP avec clé privée native AndroidKeyStore.
- `database/index.js` : `SQLite.openDatabaseAsync(DATABASE_NAME)` sans SQLCipher. Cela ne donne pas un stockage local chiffré au sens applicatif.
- Mode hors connexion : visites, équipements, remarques, photos et autres informations réelles peuvent rester sur tablette. Il est donc **inexact** d'affirmer que l'installation ne contient « aucune donnée sensible » après usage.
- `databaseBackup.js` : export de DB et ZIP contenant des photos en clair historique, explicitement bloqués lorsque `METRA_PLAY_SECURE_BUILD=true`. Cela supprime l'export non chiffré, mais prive aussi l'utilisateur de certaines fonctions ; adapter les écrans et prévoir une sauvegarde chiffrée validée.
- `supportDump.js` : export diagnostic non anonymisé bloqué dans le profil Play.
- `photoDocumentsStorage.js` : copie de photos dans un dossier choisi par l'utilisateur via Storage Access Framework, à considérer comme sortie potentiellement non chiffrée ; besoin d'informer l'utilisateur, préserver la confidentialité et maîtriser la destination.
- Back-end : aucune vérification réelle du contrôle d'accès par client, de l'expiration des jetons, des journaux du serveur ou du droit de synchroniser des dossiers clients n'a été faite.

## 3. Vulnérabilités npm (reproduites dans GitHub Actions)

Audit `npm audit --omit=dev --json` : 16 avertissements, **4 high** et **12 moderate**. État [ici](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44718118585).

**Priorité Excel :** METRA importe les fichiers Excel ; `xlsx@0.18.5` est concerné par des avis de sécurité impliquant des fichiers malveillants (`CVE-2023-30533`, `CVE-2024-22363`). Le registre npm public est bloqué sur une ancienne version ; SheetJS propose une version corrigée depuis son CDN officiel (à épingler et contrôler). **Ne pas effectuer une mise à niveau sans les tests de roundtrip ICPE/REMAR/Excel et les modèles originaux.**

Autres paquets high : `postcss`, `image-size`, `brace-expansion` ; attribuer leurs chemins de dépendance et leur exposition réelle. Éviter de traiter les outils de compilation comme s'ils étaient nécessairement exécutés dans l'APK.

Source éditeur : https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

## 4. Audit historique Git

Gitleaks 8.24.3 sur historique complet : **4 détections**, toutes de type `generic-api-key` ; une détection dans `networkProgramming.js` et trois dans le sous-arbre `features/`. Les quatre chaînes doivent être examinées **dans un environnement privé**, jamais copiées dans un rapport public. Les quatre détections ne prouvent pas quatre clés fonctionnelles distinctes. Si elles correspondent à des clés réelles, révoquer et renouveler avant diffusion. Un changement de branche ou `gitignore` ne les retire pas des anciens commits. Évaluer la nécessité de rendre le dépôt privé, en préservant l'historique et les collaborations.

## 5. Données Play Console et conformité

- Nouveau dépôt Android candidat : `com.visitetechnique.tablet` avec SDK cible 36, correspondant aux exigences de 2026.
- Préférer **Managed Google Play privé** pour les techniciens E&S si l'organisation gère ses appareils ; sinon accès par code d'activation et démonstration réutilisable sur données fictives pour l'examen Google.
- Ne pas déclarer « Aucune donnée collectée » si l'application transmet des visites/photos au serveur. Examiner les données personnelles présentes dans les saisies, images, signatures et dossiers.
- Une **politique de confidentialité METRA spécifique, validée et publique** doit figurer dans Play Console et être accessible dans l'application : URL existante du site E&S non adaptée telle quelle.
- Le titulaire du compte développeur doit disposer de l'autorisation de publier le nom et les visuels d'ENERGIE ET SERVICE.
- Captures d'écran Play : **données entièrement fictives**, y compris les clients, les photos, les locaux, les adresses, les plans et les relevés.
- Code d'activation de démonstration : créer côté serveur, communiquer **seulement dans le champ sécurisé de Google Play**, jamais sur GitHub.
- Signature : générer une **clé d'upload dédiée**, la déposer dans les secrets GitHub Actions : `METRA_PLAY_UPLOAD_KEYSTORE_BASE64`, `METRA_PLAY_STORE_PASSWORD`, `METRA_PLAY_KEY_ALIAS`, `METRA_PLAY_KEY_PASSWORD`. Activer Play App Signing. Ne jamais réutiliser `androiddebugkey`.
- Les APK historiques signés avec une clé de débogage ne pourront pas être mis à jour sur place par une application signée avec une identité différente ; anticiper la sauvegarde/synchronisation des visites et le changement de signature sur tablettes existantes.

## 6. Actions ordonnées pour sortir la version finale

| Priorité | Intervention | Critère de clôture |
|---|---|---|
| P0 | Qualifier les quatre détections de secrets dans le dépôt public | Clés réelles révoquées/renouvelées, faux positifs documentés en privé, aucun secret dans le binaire final. |
| P0 | Sécuriser l'import Excel en corrigeant `xlsx` et les entrées externes | Composant corrigé, fichiers piégés refusés, tests Excel/REMAR/ICPE conservés. |
| P0 | Émettre AAB signé avec une identité Play valide et vérifier le binaire | `bundleRelease`, signature, API36, permissions, manifest, données embarquées, pages 16K vérifiés. |
| P0 | Publier politique METRA et intégrer le lien dans l'application | URL officielle et politique juridiquement validée + lien fonctionnel dans Paramètres. |
| P1 | Résoudre l'écart microphone et supprimer toute permission inutile | Manifeste minimal réellement testé, dictée explicitement conservée ou retirée. |
| P1 | Garantir sécurité des données locales et exports | Modèle d'accès, protection d'une tablette perdue, sauvegarde chiffrée ou export contrôlé, tests réels. |
| P1 | Préparer environnement de revue Play | Code démo réutilisable, trames et photos fictives, accès serveur démo vérifié. |
| P1 | Vérifier évolution des signatures historiques | Test concret avec ancienne APK et données non synchronisées, procédure sans perte documentée. |
| P1 | Tester sur tablette Android 16 et terminal 16K | Caméra, galerie, OCR, dictée, offline, réimport et synchronisation, PDF/Word/Excel. |
| P2 | Qualifier les autres dépendances npm à risque | Dépendances build/runtime identifiées, remédiations ciblées et rapport actualisé. |
| P2 | Finaliser captures, logos et fiche Play | Visuels adaptés, aucune information client, validation E&S. |

## Références de contrôle

- [PR de préparation Google Play #141](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/pull/141).
- [Android 16 compilé #44715247848](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44715247848).
- [Android 16 compilé #44716712610](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44716712610).
- [REMAR QA #44716719256](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44716719256).
- [Intranet V2 QA #44716719242](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44716719242).
- [Missions QA #44716719224](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44716719224).
- [Audit dépendances et historique #44718118585](https://github.com/SANS-COLORANT/VISITE-TECHNIQUE/actions/runs/44718118585).
- [Exigence cible Android API 36](https://developer.android.com/google/play/requirements/target-sdk).
- [Exigence de confidentialité Play Console](https://support.google.com/googleplay/android-developer/answer/10144311).
- [Installation SheetJS sécurisée](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

**Conclusion :** la capacité de construire METRA en Android 16 est maintenant démontrée ; l'autorisation de publier en production **ne l'est pas**. La PR reste volontairement en brouillon.
