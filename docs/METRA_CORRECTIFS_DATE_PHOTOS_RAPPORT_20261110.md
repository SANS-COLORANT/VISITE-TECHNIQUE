# METRA — dates, photos et rapports (10 novembre 2026)

Date de visite : une édition valide du champ Date de visite modifie désormais
simultanément visites.date_visite et tous les champs de date présents,
avec invalidation des listes de visites et des résumés de locaux. La date
historique n'est pas remplacée par la date du jour à l'ouverture.

Photo : le titre modifié dans la galerie ou dans la préparation du rapport
est écrit en SQLite (label et libelle_personnalise). Les écritures sont
séquentielles pour éviter qu'une ancienne saisie remplace la dernière.
L'Intranet déjà synchronisé n'est pas renommé sans API de modification.

Rapports : option Lignes vides désactivée masque /, S.O et Sans objet.
Une section entièrement vide n'engendre pas de tableau PDF ou Word.
La règle est commune aux rapports PDF, Word et à l'aperçu.

À valider avant diffusion : appareils Android réels, tests de trames,
Excel et photo Intranet, signature et installabilité de l'APK native.
