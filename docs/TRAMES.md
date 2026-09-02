# METRA — Règles des trames

## Trames supportées

- ICPE
- VMC
- Pré-allumage

Chaque trame possède ses propres contrôles, commentaires, remarques, réserves, exports et règles de présentation.

## Isolation obligatoire

Une trame ne doit pas récupérer automatiquement les remarques, réserves ou résultats d’une autre trame.

Le patrimoine peut être commun, mais l’affichage est filtré selon la trame.

## Contrôles

Chaque contrôle peut contenir :
- un intitulé ;
- un avis `S / N.S / N.R / S.O / N.V` ;
- un commentaire ;
- un preset de commentaire ;
- un motif complémentaire ;
- une mesure et une unité ;
- une photo ;
- une proposition de réserve.

Un avis `S` doit aussi pouvoir renseigner un commentaire conforme automatiquement.

## Pré-allumage

Organisation cible :
1. Informations générales
2. Locaux / SST et plan du site
3. Compteurs
4. Régulation et températures
5. Chaufferie
6. Sous-stations
7. Équipements applicables
8. Réserves / conclusion
9. Photos

Les données permanentes sont récupérées depuis le site et le patrimoine. Les résultats des essais, relevés et températures sont des données du jour.

## VMC

La visite VMC ne doit afficher que les équipements et remarques applicables à la VMC : caissons, réseaux, organes VMC et contrôles associés.

## ICPE

La visite ICPE ne doit afficher que les contrôles, équipements, remarques et réserves applicables à l’ICPE.

## Excel

Chaque trame conserve son modèle Excel officiel. Les mappings d’import/export sont propres à la trame et ne doivent pas être généralisés sans test explicite des trois formats.
