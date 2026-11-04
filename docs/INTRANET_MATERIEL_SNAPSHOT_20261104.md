# METRA ↔ Intranet — contrat matériel pour toutes les trames (04/11/2026)

## Décision métier

La **liste de matériel validée dans la visite METRA est autoritaire**. Le même contrat s'applique à ICPE, Réseau de chaleur, REMAR, VMC, Pré-allumage et aux nouvelles trames. Une désignation homonyme n'est jamais un critère suffisant pour fusionner deux équipements.

Pour le POST de création **existant**, utiliser une **photographie complète** du listing `materiels[]` de la visite (et NON un patch partiel) :

| Action terrain | Contenu du listing envoyé | Résultat attendu sur le patrimoine du local Intranet |
| --- | --- | --- |
| Matériel inchangé | Ligne conservée | 1 matériel conservé |
| Modification de marque, modèle, état, quantité, etc. | Ligne avec la nouvelle valeur saisie | Ancienne valeur remplacée |
| Matériel ajouté | Nouvelle ligne | Création d'un matériel |
| Matériel supprimé | Ancienne ligne absente | Suppression du patrimoine courant |
| Tous les matériels supprimés | `materiels: []` | Listing courant vide |
| Deux appareils identiques | Deux lignes distinctes | Deux équipements distincts, jamais dédupliqués par libellé |
| Resynchronisation après panne | JSON et `envoiId` inchangés | Aucun effet supplémentaire |

### Import Intranet → METRA

Une préparation explicitement importée fournit le listing courant du local : rapprocher 1→1 les identifiants matériels, ajouter les absents, mettre à jour les présents, retirer les anciens matériels importés qui ont disparu de la référence. Ne jamais réactiver du matériel absent par une injection globale à l'ouverture de l'écran. **Ne pas détruire les anciennes visites, leurs observations, photos ou réserves** : le retrait concerne le patrimoine courant.

Les créations purement locales non encore publiées doivent rester sauvegardées, et un import de référence ne peut pas les supprimer silencieusement.

### Export METRA → Intranet

La liste n'est jamais reconstituée depuis un patrimoine global ambigu au moment de l'envoi. Les lignes actuelles de `materiel` rattachées à la visite font foi. Les différences avec le snapshot importé sont des **diagnostics non bloquants**. La validation des identifiants client/site/local, la forme du JSON, les contraintes techniques HTTP et les accusés restent obligatoires.

Un état hors enum Symfony (ex. « Dégradé ») n'a PAS encore de champ de réception libre dans le POST V1 connu. METRA conserve la saisie dans les notes Intranet et, si possible, l'ancien état enum dans le listing. Ce n'est **pas** une compatibilité parfaite : l'Intranet doit prendre en charge la valeur métier libre pour afficher « Dégradé » comme état. Ne jamais prétendre que l'ancienne valeur visible équivaut à la nouvelle.

## Évolution API Symfony indispensable — correction d'une visite déjà publiée

Le POST `/api/clients/{clientId}/visites` crée une visite et utilise `envoiId` comme clé d'idempotence. Si la même visite existe déjà, **ne pas la recréer**.

Implémenter/documenter un PATCH (chemin officiel à fournir par l'équipe Intranet) portant l'identité immuable du client/site/local/trame, la visite distante et une version de ressource. Une mise à jour doit fournir soit :

- `materielsMode: "replace"` + listing complet (préféré, sans ambiguïté) ;
- soit `mutationsMateriels` avec `create/update/delete` par identifiant matériel serveur stable, ordre des mutations et version de référence.

Les opérations doivent être atomiques et idempotentes : un retry après coupure ne crée rien, une suppression ne ressuscite pas à la visite suivante, et deux appareils identiques restent distincts. Répondre avec ID de visite inchangé, révision mise à jour, ACK des lignes et erreurs 409 / 422 explicites. Autoriser les états libres du technicien ou ajouter une propriété `etatSaisi` structurée, renvoyée inchangée.

## Recette requise avant publication

1. Importer une liste `A,B,B,C` (les deux `B` sont deux matériels physiques différents) puis réimporter la même liste : compter exactement quatre lignes.
2. Supprimer `A`, modifier `C`, ajouter `D` : exporter `B,B,C_modifié,D` ; vérifier le listing serveur exact et aucune ligne `A`.
3. Supprimer tous les matériels : le serveur renvoie un listing vide.
4. Retélécharger le patrimoine puis recréer une visite : le retrait reste effectif, aucune ancienne ligne ne réapparaît.
5. Couper le réseau après acceptation serveur, rejouer la même clé d'idempotence : aucune multiplication.
6. Modifier une visite déjà synchronisée : PATCH sur même `remoteVisitId`, jamais second POST, révision et ACK testés.
7. Tester `Dégradé` et les textes libres dans le **champ métier** côté Intranet, puis vérifier la restitution à l'identique.
8. Tester l'intégralité des trames, plusieurs locaux d'un site, et la conservation des anciens rapports, photos, observations et réserves.
9. Vérifier sur vrai serveur Symfony que le POST V1 remplace bien `ListingMateriel` et qu'une liste vide est acceptée avant toute publication APK.

**Statut** : le code METRA de la branche peut couvrir la projection et le rapprochement local ; les points PATCH, lecture de contrôle serveur et états libres natifs nécessitent encore l'implémentation / validation Symfony. La CI simulée ne vaut pas preuve d'une synchronisation réelle sur l'Intranet de production.
