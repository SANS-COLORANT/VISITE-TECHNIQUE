# Décision : retrait de la lecture automatique des compteurs et températures

**Décision (9 octobre 2026) :** la lecture automatique (OCR) des index de compteurs et des températures est retirée. Elle ne donnait pas une lecture assez fiable pour un relevé qui alimente des rapports. La photo est conservée : elle reste la preuve du relevé, et la valeur est saisie par l'utilisateur.

## Ce qui change dans l'appli

- Compteurs et températures : prendre la photo l'enregistre, puis l'écran « Saisie du relevé » s'ouvre avec la photo et un champ **vide** (aussi dans le Mode Photo). Rien n'est proposé ni pré-rempli.
- Plaque signalétique : **inchangée**. La lecture du texte imprimé reste active (ML Kit embarqué, hors connexion), avec validation par l'utilisateur.
- Module Missions (LAB, désactivé par défaut) : inchangé. Il garde son extraction de texte de documents.
- Aucun schéma SQLite, export Excel/PDF/Word ni service Intranet n'est modifié.

## Ce qui a été retiré

Lecteur d'index natif (`MeterOcrProcessor`, `MeterImageDecoder`, `MeterSegmentReader`, `SevenSegmentReader/Model/Weights`, méthode `recognizeMeter`), analyseur JavaScript d'index et de température, tests et fixtures associés, outils d'entraînement, notes de QA. Les contrôles de source interdisent leur retour silencieux (`check_phone_photo_mode_contract.js`).

## Pourquoi

Mesures sur des photos réelles de compteurs de chauffage et d'eau (Kamstrup, Actaris, Itron, Zenner) :

- ML Kit confond les segments allumés et éteints des afficheurs LCD (0/8, 4/9, 1/7), perd la virgule, et répète la même erreur sur plusieurs passes qui se « confirment » (un 955,67 lu `9555` a été reporté à tort sur tablette).
- Un lecteur par segments, puis un petit réseau entraîné, n'ont retrouvé que 41 à 78 % des chiffres sur des photos jamais vues, et 16 à 33 % sur les photos testées sur tablette. Aucun n'était meilleur partout, et les marges de confiance n'étaient pas calibrées.
- Les afficheurs sombres, avec reflets ou pris en biais ne sont pas lisibles de façon sûre.

## Pistes si le besoin revient

1. Saisie assistée : relevé précédent affiché, contrôle « supérieur au précédent » et plage plausible, clavier numérique avec virgule, dictée locale.
2. Lecture directe par tête optique ou M-Bus (exacte, hors connexion, mais matériel et protocole par marque).
3. Un jeu de plusieurs centaines de photos étiquetées avant toute nouvelle tentative d'OCR, conservé hors du dépôt.

L'historique du code retiré reste dans Git (commits « lecture par segments » et « classifieur de chiffres » de la branche `claude/new-session-ysrt94`, et branche `fix/meter-ocr-build662`).
