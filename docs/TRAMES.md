# METRA — Règles des trames

## Trames supportées

- ICPE
- VMC
- Pré-allumage
- Réseau de chaleur

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

## Réseau de chaleur

La trame `reseau_chaleur_v1` reprend le classeur métier « TRAME RÉSEAU DE CHALEUR ».

Règles spécifiques :
- les non-conformités issues des contrôles sont classées automatiquement en `Primaire` ou `Secondaire` suivant le point contrôlé ;
- les températures PRIMAIRE et de production ECS sont primaires ;
- les températures du réseau chauffage et le pH sont secondaires ;
- les organes de production (fumées, soupapes, ligne gaz, coupure combustible, organes directement portés par le ballon ECS) sont primaires ;
- le traitement/distribution, l'électricité, le local, l'incendie et les auxiliaires sont secondaires ;
- les réserves manuelles doivent être classées explicitement ;
- chaque équipement utilisé par cette trame doit être classé `Primaire` ou `Secondaire` ; ce classement est stocké sur l'association équipement/trame et n'affecte pas ICPE/VMC/Pré-allumage ;
- l'export est refusé tant qu'un équipement ou une réserve Réseau de chaleur n'est pas classé ;
- l'Excel final remplit automatiquement les blocs « REMARQUES SUR LE PRIMAIRE » et « REMARQUES SUR LE SECONDAIRE ».

Les commentaires, photos, criticités et réserves utilisent les composants durables communs aux autres visites techniques.

Une nouvelle visite Réseau de chaleur reprend les champs de référence déclarés
`carryForward`, le patrimoine du même local (équipements et classement
Primaire/Secondaire, réseaux, définitions et unités des compteurs), ainsi que les
paramètres de régulation. Les index, pressions, températures mesurées, avis,
états observés, photos, réserves et conclusions restent dans leur visite
d'origine. Une visite récente vide ne masque pas les références importées
plus anciennes du même local et de cette même trame.

L'import Excel rattache sa visite à l'installation qui reçoit le patrimoine.
Les anciens imports sans rattachement sont récupérés seulement si leurs objets
patrimoniaux liés identifient un local unique. Sur un site comportant plusieurs
locaux, un import sans nom de local ni cible explicite est refusé pour éviter
d'affecter les données arbitrairement au premier local.

## Excel

Chaque trame conserve son modèle Excel officiel. Les mappings d’import/export sont propres à la trame et ne doivent pas être généralisés sans test explicite des trois formats.

Pour ICPE et Réseau de chaleur, la destination d'un compteur est conservée
dans le patrimoine du local, indépendamment de son nom. Un renommage fige
d'abord la ligne historique ; un échec de sauvegarde empêche ce renommage.
Les compteurs supplémentaires ne remplissent aucune ligne standard. Les
doublons sont conservés dans Excel et signalés comme ambigus pour l'Intranet.
Les index enregistrés dans les compteurs font autorité sur les anciens champs
Excel importés, y compris après effacement ou changement de destination.
La valeur précédente affichée provient d'une visite antérieure du compteur,
sans devenir le relevé de la nouvelle visite RCU.
