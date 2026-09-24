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

## Lots QR hors connexion

Pour les cas où la tablette et le téléphone ne disposent d'aucun réseau local commun, le périmètre **Client** peut également être transféré par une série de QR codes statiques.

La tablette :

1. construit un instantané compact du client avec ses sites, locaux et références de visites ;
2. découpe automatiquement cet instantané en autant de QR que nécessaire ;
3. conserve le lot dans la fiche du client ;
4. affiche les QR sous forme de pages horizontales avec le numéro, les noms de sites et une description du contenu ;
5. permet de rouvrir un ancien lot sans le régénérer.

Le téléphone :

1. reconnaît un lot QR hors connexion ;
2. enregistre chaque QR immédiatement dans le stockage privé METRA ;
3. rouvre automatiquement le scanner pour le QR suivant ;
4. conserve la progression si l'utilisateur s'arrête ou ferme l'application ;
5. affiche les clients QR déjà enregistrés et le nombre de QR reçus / attendus ;
6. permet de reprendre le scan plusieurs heures ou plusieurs jours plus tard.

Un QR déjà lu peut être rescanné sans dupliquer les sites. Les fragments d'un même site sont fusionnés par identifiants stables.

Le lot QR hors connexion transporte volontairement un **contexte client léger**. Il ne remplace pas la liaison Compagnon pour les modules détaillés d'une visite ni pour le transfert des photos. Une fois une liaison locale disponible, la session Compagnon complète peut être utilisée sans perdre le client déjà mémorisé.

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
