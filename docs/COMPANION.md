# METRA — Téléphone intégral et mode Compagnon

## Objectif

La même application Android peut être utilisée de deux manières sur un téléphone :

- **Version intégrale** : accès à l'application METRA complète avec l'interface responsive existante.
- **Mode Compagnon** : le téléphone se rattache temporairement à la visite ouverte sur une tablette et devient un outil de capture rapide.

La tablette reste la source principale de la visite pendant une session Compagnon.

## Appairage tablette → téléphone

Depuis une visite ouverte sur une tablette, l'action **Téléphone** ouvre une session locale temporaire et affiche un QR code.

Le QR ne transporte pas le contenu métier de la visite. Il contient uniquement les informations éphémères nécessaires à la connexion locale :

- adresse IP locale de la tablette ;
- port temporaire ;
- identifiant de session ;
- jeton aléatoire de session ;
- version du protocole.

Après authentification, la tablette transmet au téléphone un instantané léger de la visite.

La session est détruite lorsque la fenêtre Compagnon est fermée.

## Réseau

Le transport Compagnon fonctionne directement sur le réseau local Android. Le téléphone et la tablette doivent être joignables sur le **même Wi-Fi local ou le même point d'accès/hotspot**.

Le transfert des données et des photos ne dépend pas de l'Intranet et ne nécessite pas d'accès Internet une fois les appareils sur le même réseau local.

Le scan QR s'appuie sur le scanner de codes Google disponible sur Android. Selon l'état de Google Play Services sur l'appareil, son composant de scan peut nécessiter d'avoir été téléchargé au préalable.

## Modules du téléphone Compagnon

Le téléphone ne reproduit pas la trame tablette. Il présente des familles métier immédiatement reconnaissables grâce à une bibliothèque de pictogrammes CVC :

- Équipements — outils ;
- Compteurs — cadran ;
- Températures — thermomètre ;
- Locaux — bâtiment/local technique ;
- Distribution — réseau de tuyauteries ;
- Régulation — régulateur/automate ;
- Remarques — avertissement ;
- Contrôles — fiche de contrôle ;
- Photos — appareil photo.

Chaque tuile affiche le **nombre réel d'éléments de la visite**.

Un appui sur une famille ouvre la liste des éléments correspondants. Un appui sur un élément ouvre directement la capture photo.

## Rattachement des photos

Chaque cible reçue du téléphone conserve une clé métier compatible avec le stockage photo existant de METRA, par exemple :

- `equipement||<id>` ;
- `materiel||<id>` ;
- `compteur_site||<id>` ou `compteur||<id>` ;
- `reseau_site||<id>` ou `reseau||<id>` ;
- `remarque||<id>` ;
- `installation||<id>` ;
- `<section_code>||<cle>` pour les champs et contrôles.

La tablette réutilise ensuite le pipeline normal de `PhotoButton.js` pour le nommage métier et le stockage durable.

## File d'attente hors ligne

Avant chaque envoi, la photo prise sur le téléphone est copiée dans une file d'attente persistante sous le stockage privé METRA.

La photo n'est retirée de cette file que lorsque la tablette confirme son import.

Si la liaison locale est perdue :

1. les captures déjà prises restent sur le téléphone ;
2. leur cible métier est conservée avec la photo ;
3. après reconnexion, la file est renvoyée ;
4. la tablette déduplique les retransmissions grâce à `transferId`.

La perte momentanée de la liaison ne doit donc pas provoquer de perte ni de double photo.

## Isolation métier

Le mode Compagnon ne crée aucun lien avec l'Intranet. Il agit uniquement sur la visite locale déjà ouverte sur la tablette.

Les photos reçues restent des observations de la visite courante et conservent les règles d'isolation ICPE / VMC / Pré-allumage déjà appliquées par METRA.

## Validation matérielle requise

Avant fusion finale :

- Samsung tablette + Samsung téléphone sur le même Wi-Fi ;
- Samsung tablette + Samsung téléphone sur hotspot local sans accès Internet ;
- appairage QR ;
- réception du bon site et de la bonne visite ;
- comptage réel des équipements, compteurs, températures, locaux, réseaux et remarques ;
- photo d'un équipement ;
- photo de chacun de plusieurs compteurs ;
- photo d'une température ;
- photo d'une remarque ;
- coupure réseau après capture puis reconnexion ;
- vérification de l'absence de doublon après retransmission ;
- rotation portrait/paysage sur téléphone ;
- tablette portrait et paysage ;
- persistance des photos après fermeture/réouverture ;
- galerie, rapports et exports existants non régressés ;
- compilation Android release.
