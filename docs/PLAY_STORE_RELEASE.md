# METRA — release Android / Google Play (20 novembre 2026)

## Branch de préparation

Source fonctionnelle : `fix/visit-three-bottom-actions-20261117`.
Travail isolé : `release/metra-playstore-secure-20261120`.
Ne pas fusionner sans contrôle métier sur tablette et vérification de l'Intranet.

## Sécurité de base

- Identifiant conservé : `com.visitetechnique.tablet`.
- Expo SDK 54 retenu pour Android API 36 avec architecture React Native historique (désactivation explicite de la New Architecture). Évolution ultérieure vers une version plus récente après tests.
- Dans le profil Play : aucune valeur de jeton, mot de passe de production, certificat privé ou donnée de visite ne doit être intégrée au code livré.
- Requêtes Intranet : DPoP / stockage de jetons existants, non remplacés.
- Backup Android cloud et transfert d'app interdits ; pas de trafic HTTP en clair.
- Sauvegardes manuelles et automatiques SQLite non chiffrées et export support désactivés en mode Play, dans l'attente d'une solution chiffrée.
- Les exports de rapports autorisés par l'utilisateur (PDF, Excel, Word, photos) restent des contenus métier : protéger leur partage et leur destinataire.
- La base SQLite **n'est pas encore chiffrée au repos** et doit faire l'objet d'une migration spécifique sans perte de données. Ne jamais prétendre qu'une installation sur tablette est exempte de données sensibles après import Intranet.
- Les contrôles automatiques de secrets sont indicatifs : scanner aussi l'historique Git, les archives publiées, les dépendances et l'AAB final.

## Clé de publication obligatoire

La version Play Store doit être signée avec une **clé de téléversement dédiée**, jamais avec `androiddebugkey`.
Créer une clé dans un environnement sûr, la conserver hors dépôt et configurer dans les **Secrets GitHub Actions** :
`METRA_PLAY_UPLOAD_KEYSTORE_BASE64`, `METRA_PLAY_STORE_PASSWORD`, `METRA_PLAY_KEY_ALIAS`, `METRA_PLAY_KEY_PASSWORD`.
Ne jamais intégrer la clé dans Git, dans un artifact public ou dans un message.
Le workflow refuse de produire un AAB Play en leur absence ; il peut produire un APK *test* signé avec l'ancienne identité de débogage, **non adapté à la distribution commerciale**.

Le Google Maps API key est volontairement absent du build Play par défaut : METRA bascule sur sa carte hors ligne, à réévaluer après restriction Android package+certificat.

## Contrôles préalables avant mise en production

1. Confirmer que les sources et ressources ne contiennent aucun client, visite, photo ou identifiant réel.
2. Faire exécuter les tests ICPE, REMAR, VMC, pré-allumage, sauvegarde, import/export, synchronisation bidirectionnelle.
3. Vérifier une installation neuve, une reprise des visites hors ligne, les droits de partage, la suppression des données et les appels Intranet.
4. Effectuer un essai de mise à jour **sans désinstallation** sur une tablette avec données fictives. Attention : la signature Play App Signing peut être différente de celle des APK historiques ; dans ce cas la mise à jour directe est impossible.
5. Fournir dans Play Console politique de confidentialité, fiche données collectées, usage des permissions et compte de démonstration sans données réelles.
6. Réaliser audit indépendant de l'AAB final (signataire, target SDK/API36, permissions, secrets, 16 KiB page size, comportement sécurité des fichiers, déploiement fermé).

## Commande de build

Le workflow `.github/workflows/metra-playstore-secure.yml` tente le build Android API36 et archive les fichiers dans GitHub Actions. Si les secrets de signature Play sont présents, il produit `METRA-PlayStore.aab` ; sinon seul un APK de test peut être proposé.

**Aucun build n'est « certifié sécurisé » par le seul succès d'un workflow CI.**
