# Écran Équipements : on signale l'exception

Un équipement reste tel quel : l'état de la dernière visite est repris, et l'envoi Intranet reprend déjà tous les équipements de la visite (état de référence quand rien n'est saisi). Le pointage « présent » n'est donc plus demandé ; `confirme_le` reste en base et la fiche garde le bouton « Marquer présent ».

## Gestes de la liste

- **Glisser vers la droite** : Vétuste ou HS (stocké « Hors service », valeur acceptée par l'Intranet). « Annuler » dans le toast.
- **Glisser vers la gauche** : Retiré du site (confirmation, historique conservé) ou Remplacé (confirmation) : le nouvel équipement est créé **avant** le retrait de l'ancien, avec même type, désignation, réseau, périmètre et nombre ; sa fiche s'ouvre pour lire la plaque.
- **Toucher une ligne** : les mêmes actions en gros boutons, « Remettre en Bon », et la fiche complète.
- Un glissement sur une ligne l'emporte sur le balayage entre onglets ; ailleurs sur l'écran, le balayage reste actif.

## Bandeau, filtres, groupes

Bandeau « x à surveiller · y nouveaux » ; filtres Tous / À surveiller (vétuste, HS) / Nouveaux ; les groupes qui contiennent un équipement à surveiller ou nouveau s'ouvrent seuls.

## Bouton +

Photographier la plaque ; Dupliquer ; Remplacer ; Catalogue ; Nombre à créer (1 à 9) ; types (fréquents du local d'abord, recherche) ; « Créer « … » » quand le type est introuvable ; « Autre équipement : lui donner un nom » (nom, type libre) ; équipements retrouvés dans les autres locaux du site.

Contrôle : `.github/scripts/check_equipment_exception_ui.js`. Aucune migration, aucune clé de stockage modifiée.
