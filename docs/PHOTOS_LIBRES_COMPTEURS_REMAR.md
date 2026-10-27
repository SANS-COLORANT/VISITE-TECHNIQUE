# MÉTRA — photos libres et compteurs REMAR, sécurité d'intégration

## Compteurs REMAR
- La cellule REMAR conserve les lignes séparées par `\n` : un compteur par ligne (`Nom : index unité`), y compris pour les imports Excel. Les sauts de lignes existants sont conservés; les lignes sont modifiables, le bouton « + Ajouter un compteur » insère une nouvelle ligne. La cellule exportée reste identique.
- Les autres trames conservent leur sérialiseur et leur saisie. `releveMultiligne.js` n'est pas modifié.
- La création d'entités de compteur patrimonial indépendantes à partir de ces lignes est **hors périmètre** de ce correctif; elle demanderait un mapping stable par critère sans doublons.

## Photos libres
- Ancien « Mode Photo » remplacé par « Photo libre » qui ouvre la rubrique Photos. Le bouton « Photo libre » de la rubrique déclenche la caméra et conserve le nom client/site/local habituel.
- Les nouvelles photos libres et les anciennes photos non rattachées sont **locales uniquement** par défaut. Elles n'apparaissent ni dans les rapports générés ni dans les envois Intranet.
- Dans la visionneuse, modifier le libellé enregistre `photos.label` sans renommer le fichier physique; l'outbox en attente est mise à jour avant envoi.
- Dans la visionneuse d'une photo libre, « intégrer au rapport et Intranet » autorise explicitement la publication. L'option inverse retire les transferts non encore envoyés; elle **ne peut pas supprimer rétroactivement une photo déjà envoyée** au serveur.
- Le choix est durable dans la table locale séparée `photo_publication` créée à la demande, sans modifier les colonnes historiques de `photos`. Il est revérifié au moment de mettre la photo en file **et** juste avant envoi.
- Les photos rattachées aux équipements, contrôles et réserves gardent leur comportement historique.

## Recette et limites
- Vérifier Android physique, hors ligne, réouverture après redémarrage, partage de photo entre onglets et transfert Intranet en condition réelle.
- Vérifier deux compteurs dans une cellule REMAR, avec et sans libellé, plus un import XLSX contenant CRLF et lignes vides.
- Vérifier photographie libre, renommage, rapport par défaut, intégration après synchronisation d'une visite, exclusion après pré-queue et existence des photos déjà transmises.
- Aucun changement sur `native-android` tant que la PR de recette et les tests sont incomplets.
