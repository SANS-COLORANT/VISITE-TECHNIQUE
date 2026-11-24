# METRA — qualification AAB 44 (24 novembre 2026)

Branche QA exclusivement. Base exacte : 0674fd66456833ff8a570ff0a2b49afc08720dd3. Aucun fichier métier modifié, aucune publication, aucune connexion Intranet de production.

## Barrière de qualification
- Audit transverse sur la base exacte du candidat 44, et tests dédiés de sauvegarde.
- Vérification SHA-256 et signature des AAB 38 et 44, puis conversion en APK universels avec bundletool et un certificat QA éphémère identique. Ce n'est pas la signature de distribution Play.
- Émulateur Android 16 isolé, hors ligne, données synthétiques. Refus d'un appareil physique.
- Installation 38, fixture SQLite non vide (clients, sites, visites, contrôles, remarques, réseaux, compteurs, matériel, notes, photos, Missions), puis mise à jour 44 sans désinstaller.
- Comparaison des champs de 13 tables et SHA-256 de trois fichiers; intégrité et clés étrangères.
- Export AES réel, vérification indépendante, modification volontaire de la fixture, mauvais mot de passe, import AES, archive corrompue, import v1 de structure historique avec URI ancienne.
- Vérifier que v1 préserve les fichiers hors périmètre historique. Attention: v1 ne contient pas tous les médias Missions/Intranet; un import v1 n'est pas une restauration complète de ceux-ci.

## Blocages non levés par cette seule CI
- Import d'une archive réellement produite par un ancien APK (la fixture v1 n'est que représentative), anciennes bases avant schéma 51.
- Crash/arrêt brutal à chaque étape du remplacement et récupération automatique au démarrage.
- Récupération partielle explicite des sauvegardes incomplètes et preuve que chaque fichier référencé est présent; jamais déclarer complète une récupération partielle.
- Tous les écrans et fenêtres, deux modes navigation, clavier, tablette, Samsung, caméra/galerie, export sur appareil, gros volumes, Intranet en environnement de test.
- APK splits distribués par Google Play avec certificat Play; tests en canal interne sur appareil réel.

Une erreur, un contrôle non exécuté ou un résultat absent reste FAIL/BLOCKED. Pas de fusion ni de publication automatique. Ne jamais désinstaller ou effacer le Samsung pour ce test.
