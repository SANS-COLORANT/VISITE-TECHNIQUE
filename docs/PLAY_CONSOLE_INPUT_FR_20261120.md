# METRA — Dossier prêt à saisir dans Google Play Console (FR)
Date : 20 novembre 2026

> **PROJET — non publiable en l'état.** La version Play Store doit d'abord compiler, être signée avec une clé dédiée et faire l'objet d'un contrôle RGPD et d'un essai réel sur tablette.
> Le dépôt GitHub est public : **n'ajouter ici aucun code d'activation, identifiant de test, jeton, donnée client ou clé de signature**.

## 1. Fiche Play Store

- Nom (26/30) : `METRA – Visites techniques`
- Langue : Français (France)
- Description courte (73/80) : `Visites CVC, relevés, photos et rapports techniques, même hors connexion.`
- Type : Application
- Catégorie conseillée : Professionnel (Business)
- Prix : Gratuit (à confirmer avec E&S)
- Public : professionnels adultes
- Zone : France
- Publicité : non détectée dans les dépendances auditées ; à revérifier dans le build final
- Aucun achat intégré prévu

### Description complète (copier dans Play Console)

METRA accompagne les professionnels dans leurs visites techniques des installations de chauffage, ventilation, eau chaude sanitaire et réseaux de chaleur.

Conçue pour les équipes autorisées d’Énergie & Service, l’application permet de préparer, réaliser et documenter les visites sur tablette Android.

FONCTIONNALITÉS
• Organisation des dossiers par client, site et local technique.
• Formulaires de contrôle adaptés aux trames disponibles : ICPE, REMAR, VMC, réseau de chaleur et pré-allumage.
• Inventaire des équipements, relevés de mesures, compteurs et températures.
• Suivi des contrôles, observations, réserves et actions à mener.
• Capture de photos et ajout d’images choisies par l’utilisateur.
• Travail hors connexion sur les dossiers déjà enregistrés.
• Synchronisation des informations autorisées avec l’Intranet de l’entreprise.
• Édition de documents de visite en PDF, Excel et Word selon les fonctionnalités disponibles.

ACCÈS PROFESSIONNEL
METRA est destinée aux collaborateurs et utilisateurs expressément autorisés. Une activation est nécessaire pour accéder aux informations de l’organisation. Installer l’application ne donne pas accès aux données des clients.

CONFIDENTIALITÉ
Les données de visites et les photographies sont utilisées pour les missions techniques professionnelles. La politique de confidentialité précise les traitements applicables, les destinataires et les modalités d’exercice des droits.

## 2. Développeur et support (approbation E&S nécessaire)

- Éditeur proposé : ENERGIE ET SERVICE (sous réserve d'accord de publication)
- Adresse : 143 rue Yves le Coz, 78000 Versailles, France
- SIREN : 338 335 201
- Site officiel : https://energieetservice.fr
- Contact général public : contact.versailles@energieetservice.fr
- Téléphone général : +33 1 39 55 17 20
- **Politique de confidentialité METRA : URL À CRÉER SUR UN DOMAINE CONTRÔLÉ PAR E&S.**
  L'actuelle https://energieetservice.fr/politique-de-confidentialite/ décrit le site web et n'est pas suffisante sans modification.

## 3. Déclarations réglementaires de la fiche (à valider sur le binaire définitif)

- Contient des annonces publicitaires : a priori **Non** ; confirmer scan des SDK/publicités.
- Achats intégrés : **Non**.
- Groupe d'âge ciblé : **18 ans et plus** si E&S confirme usage exclusivement adulte.
- Accès restreint : **Oui** ; code d'activation tablette METRA de 48 caractères requis.
- Création de compte utilisateur dans l'application : aucune fonction d'inscription utilisateur trouvée, mais activation d'appareil présente. Confirmer côté serveur avant de répondre à la question « suppression du compte ».
- Contenu destiné aux enfants : **Non**.
- Classement par âge : remplir le questionnaire officiel, ne pas inventer PEGI 3.
- Données collectées : **Oui** si version publique avec Intranet. Photos, documents, saisies techniques et identifiant de tablette peuvent être transmis. Vérifier également nom/signature, diagnostic, reconnaissance vocale Android et tout fournisseur tiers.
- Données partagées : **À confirmer** selon le responsable de traitement, la distribution via compte E&S ou compte personnel et les sous-traitants.
- Données chiffrées en transit : l'API est en HTTPS/DPoP, mais valider tous les flux avec le build final.
- Stockage local : base SQLite actuellement non chiffrée au repos. Ne pas affirmer qu'elle l'est.
- Suppression de données : procédure et délais à fixer avec E&S.
- Politique de confidentialité : URL dédiée publiquement accessible + lien dans l'application.

**Exception :** la section Google « Sécurité des données » n'est pas exigée pour une application **strictement privée** publiée via Managed Google Play. La confidentialité et la protection RGPD restent obligatoires.

## 4. Accès de démonstration pour Google Play Review

Google demande un accès complet pour évaluer une application verrouillée.
METRA active une tablette avec **exactement 48 caractères** : `symfonyApi.js / activateTablet`.
Créer côté Intranet une activation de démonstration **réutilisable, disponible à tout moment**, réservée à un client/site/local fictif, sans aucune donnée réelle.
Communiquer ce code uniquement dans les champs sécurisés **Play Console > Contenu de l'application > Accès à l'application**. Ne jamais le versionner dans GitHub.

**Instructions proposées (compléter dans Play Console, PAS dans GitHub) :**

> METRA est une application professionnelle avec activation d'appareil obligatoire.
> Étape 1 : ouvrir METRA et saisir le code d'activation de démonstration fourni dans ce formulaire.
> Étape 2 : ouvrir le client fictif « Client Démonstration » et son site « Site Test ».
> Étape 3 : créer/ouvrir une visite ICPE ou REMAR, saisir un contrôle et une mesure, ajouter une photographie fictive et consulter la génération d'un rapport.
> Étape 4 : vérifier la synchronisation vers l'environnement de démonstration.
> Ce compte de démonstration ne donne accès à aucune donnée réelle. L'accès doit être réutilisable sans intervention humaine ni code à usage unique.

## 5. Visuels requis

- Icône de fiche : PNG 512 × 512 ; source candidate `assets/metra/app-icon.png`, dimensions et marges à contrôler.
- Illustration principale (*feature graphic*) : JPG ou PNG sans transparence, 1024 × 500.
- Captures d'écran réelles de la version testée, sur données fictives exclusivement ; au moins 2 au total, et prévoir **4 captures dédiées aux tablettes** si distribution pour tablettes.
- Captures suggérées : accueil/client de démonstration ; fiche site/local ; visite ICPE/REMAR avec mesures ; photos et remarques ; rapport.
- Aucune vraie adresse de copropriété, visage identifiable, nom client, jeton, plan d'accès technique, numéro de compteur réel ou équipement sensible.
- Les captures fictives ne doivent pas présenter comme fonctionnelles des options non validées.

## 6. Publication Android

- Identifiant définitif : `com.visitetechnique.tablet`.
- Format public privilégié : **Android App Bundle (.aab)**. Pour une application privée Managed Google Play, Google peut aussi accepter un APK.
- Pour une application publique nouvelle/actualisée après le 31 août 2026 : **targetSdk 36** (sauf exemptions officielles applicables).
- Vérifier les bibliothèques natives pour pages mémoire 16 KiB.
- Activer Google Play App Signing avec une **clé d'upload dédiée**, jamais la clé de debug historique.
- Dans GitHub Actions, secrets à provisionner hors dépôt :
  `METRA_PLAY_UPLOAD_KEYSTORE_BASE64`,
  `METRA_PLAY_STORE_PASSWORD`,
  `METRA_PLAY_KEY_ALIAS`,
  `METRA_PLAY_KEY_PASSWORD`.
- Vérifier la signature Play et la compatibilité avec les APK existants. Si les signatures diffèrent, synchroniser les anciennes visites avant transition : une mise à jour sur place n'est pas possible.
- Envoi initial : test interne / test fermé, puis production après validation E&S, RGPD et test matériel.
- Si compte développeur **personnel** créé après le 13 novembre 2023 : **12 testeurs inscrits pendant 14 jours continus** pour accéder à la production publique.

## 7. Notes de version proposées

Première version destinée au déploiement via Google Play : visites techniques CVC, saisies de relevés, photos, rapports et synchronisation avec l’Intranet pour les utilisateurs autorisés. Conserve le mode de travail hors connexion sur les dossiers déjà préparés.

## 8. Points bloquants avant publication

1. AAB API36 construit, signé et contrôlé ; démontrer fonctionnement réel du bundle.
2. Clé de signature distincte de `androiddebugkey` provisionnée en secret ; Play App Signing configuré.
3. Audit final des données embarquées, autorisations, flux réseau, dépendances (vulnérabilités) et base SQLite non chiffrée.
4. Politique de confidentialité spécifique METRA **publiée sur URL officielle** ET accessible dans l'application.
5. Validation de la fiche par E&S et droit de publier la marque sous le compte développeur choisi.
6. Données de démonstration et activation Play Review réutilisable sans données clients.
7. Tests de migration des installations APK historiques et protection des visites non synchronisées.
8. Captures d'écran réelles anonymisées et illustration 1024 × 500.

## 9. Sources officielles

- Règle API 36 : https://developer.android.com/google/play/requirements/target-sdk
- Fiche Play Store : https://support.google.com/googleplay/android-developer/answer/9859152
- Préparation à l'examen : https://support.google.com/googleplay/android-developer/answer/9859455
- Sécurité des données : https://support.google.com/googleplay/android-developer/answer/10787469
- Données utilisateurs et confidentialité : https://support.google.com/googleplay/android-developer/answer/10144311
- Applications privées : https://support.google.com/googleplay/android-developer/answer/9874937
- Visuels : https://support.google.com/googleplay/android-developer/answer/9866151
- Accès à l'application : https://support.google.com/googleplay/android-developer/answer/15748846
- 16 KiB : https://developer.android.com/guide/practices/page-sizes
- Tests comptes personnels : https://support.google.com/googleplay/android-developer/answer/14151465
