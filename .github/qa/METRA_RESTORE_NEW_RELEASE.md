# METRA — nouvelle version de restauration (24/11/2026)

Base : AAB 44 qualifié par les recettes 45359080688 et 45359081008. Branche isolée, pas de publication Play automatique.

## Correctifs
- Prévalidation native SQLite extraite (intégrité, clés étrangères, schéma et comptes) et vérification des médias avant modification.
- Rejet des chemins ZIP dupliqués et conflits fichier/dossier.
- Restauration ZIP V1 historique et AES-256, autorisation distincte pour un import partiel si des références média sont manquantes. Aucun effacement des lignes métier manquantes; aucune invention de fichier. Les médias hors périmètre V1 restent non garantis.
- Copie privée SQLite et médias, inventaire taille/MD5, journal armé avant remplacement. Au redémarrage, retour arrière avant ouverture SQLite; copie conservée en cas d'échec. Le test simule un état interrompu sur disque; il ne certifie pas la résistance à toute coupure matérielle.
- Accès à la base bloqué pendant remplacement, fermeture stricte, getDb ne renvoie plus une connexion native périmée.

## Livraison
Seul l'artifact METRA-PlayStore-AAB-<numéro> du job qualified-play-artifact est à importer dans le canal interne. L'artifact UNQUALIFIED ne doit pas être importé. La CI exécute l'audit de source et les tests de journal, puis vérifie le même AAB signé dans trois recettes Android 16 (mise à jour, sauvegarde/restauration, volume historique 101 visites/466 JPEG, récupération au démarrage et import partiel). Tous les tests utilisent des données fictives.

La signature Play de distribution et la recette Samsung/tablette réelle, caméra/galerie, exports terrain et Intranet de test restent à contrôler. Ne pas désinstaller le téléphone principal. Une restauration remplace les données locales; conserver une sauvegarde externe récente avant essai. Pas de promesse de récupération des octets absents de l'archive.
