# Réseau de chaleur — correspondance Intranet des synthèses

## Anomalie terrain, 28 octobre 2026
La validation locale bloquait l'envoi avec dix critères tels que :
`Critère « P2 » [REMARQUES SUR LE PRIMAIRE > Opération à effectuer] : aucun champ METRA correspondant de façon sûre.`

Ce sont les synthèses de réserves du modèle Excel Réseau de chaleur (lignes Primaire 362–366 et Secondaire 373–377), et **pas** des champs du formulaire de contrôle. Leur mapping par recherche de champ ne pouvait pas réussir.

## Règle de correction
Le sérialiseur Intranet reconnait **uniquement** le chemin explicite suivant :
- Catégorie : `REMARQUES SUR LE PRIMAIRE` ou `REMARQUES SUR LE SECONDAIRE` ;
- Sous-catégorie : `Opération à effectuer` ;
- Critère : `P2`, `P3`, `Conformité`, `Amélioration`, `Remarque` (ou `Remarques`) ;
- Trame locale : un modèle dont la définition comporte `excel.heatNetwork.summaryRows`.

Chaque cellule contient les prestations des réserves **de la visite courante seulement**, du périmètre et de la catégorie correspondants, ordonnées comme dans l'Excel, séparées par deux retours à la ligne. Cellule vide : `Sans Objet.` Avis `N.S` ou `S.O` uniquement si le serveur a déclaré `avisApplicable`. Aucune réserve n'est ajoutée, modifiée ou supprimée.

La classification existante de `excelExport.js` est conservée sans réinterprétation. Si une réserve manque de périmètre, si une catégorie serveur est inconnue, ou si le commentaire groupé dépasse 1 500 caractères, l'envoi reste **bloqué avec un message explicite**, sans troncature ni rapprochement flou.

## Précautions et recette
- Aucun changement SQLite, photos, export Excel, sécurité de rattachement Client/Site/Local ou autres trames.
- Vérifier les dix critères avec et sans réserves, les cinq catégories, les deux périmètres, l'ordre des prestations et `avisApplicable` vrai/faux.
- Vérifier qu'un critère inconnu et les visites ICPE restent bloqués.
- Exécuter `node .github/scripts/test_intranet_capability_mapping.js`, `npm run verify:metra` et le workflow APK natif complet.
- Recette physique restant nécessaire : la visite Les Ulis sur tablette, un envoi Intranet réel authentifié et la comparaison avec l'Excel de la même visite.
- Ne jamais désinstaller l'application ni écraser les données existantes pour appliquer ce correctif. Le build doit préserver la signature, le package Android et une version supérieure.
