# METRA — Modèle de données cible

## Principe

METRA sépare le **patrimoine persistant** des **données de visite**.

```text
CLIENT
  └── SITE
       ├── Bâtiments
       ├── Locaux techniques / SST
       ├── Réseaux
       ├── Équipements
       ├── Compteurs
       └── Visites
            ├── ICPE
            ├── VMC
            ├── Réseau de chaleur
            └── Pré-allumage
```

## Patrimoine partagé

Les objets suivants sont persistants et possèdent des identifiants stables :
- client ;
- site ;
- bâtiment ;
- local technique / SST ;
- réseau ;
- équipement ;
- compteur.

Un client et un site peuvent chacun disposer d'une **image de couverture patrimoniale**. Cette image est distincte des photos de visite : le fichier est conservé dans le stockage privé local de METRA pour rester disponible hors connexion et la base SQLite ne stocke que son URI (`image_uri`). Une nouvelle photo ou une image choisie dans la galerie remplace uniquement cette couverture ; elle ne crée aucune observation de visite.

Un équipement physique ne doit pas être dupliqué uniquement parce qu’il est contrôlé dans plusieurs trames.

Exemple : une pompe chauffage peut être visible dans ICPE et Pré-allumage mais reste un seul équipement patrimonial.

## Compatibilité par trame

Chaque équipement doit pouvoir déclarer ses usages de trame :
- `icpe` ;
- `vmc` ;
- `pre_allumage` ;
- `reseau_chaleur_v1`.

Une visite ne charge que les équipements compatibles avec sa trame.

Pour `reseau_chaleur_v1`, l'association `equipement_trames` porte en plus le
`perimetre` (`Primaire` / `Secondaire`). La ligne `materiel` de la visite
en conserve un instantané historique. Ce classement est donc propre à cette
trame et ne modifie pas le comportement ICPE, VMC ou Pré-allumage.

## Données de visite

Chaque visite stocke ses propres :
- contrôles ;
- avis ;
- commentaires ;
- mesures ;
- relevés ;
- photos ;
- réserves ;
- conclusion.

Ces données ne sont pas partagées entre les trames.

Dans une visite Réseau de chaleur, `remarques.perimetre` conserve le classement
Primaire / Secondaire de chaque réserve. Pour une réserve issue d'un contrôle,
ce classement est déterminé par la définition de trame ; pour une réserve
manuelle il est choisi par l'utilisateur.

## Historique

Le maillage permet de reconstruire l’historique d’un même équipement ou compteur à travers différentes visites sans mélanger les contenus des trames.

Exemple :

```text
Pompe chauffage n°1 — SST7
  ├── ICPE 2026 : observation ICPE
  ├── Pré-allumage 2026 : observation Pré-allumage
  └── Pré-allumage 2027 : observation Pré-allumage
```

## Compteurs

Les compteurs sont patrimoniaux ; leurs index sont des observations datées liées aux visites.

Un nouvel index ne doit jamais être prérempli à partir de l’ancien. L’ancien index peut être affiché comme référence.

## Photos historiques Intranet

Les photos téléchargées depuis l'API « dernières visites » sont conservées dans
un cache historique distinct des photos terrain :

- le manifeste garde les sites, locaux et identifiants de la dernière visite ;
- les fichiers sont enregistrés dans le stockage privé de l'application ;
- les métadonnées associent chaque fichier aux identifiants distants du client,
  du site, du local, de la visite et de la photo ;
- ces images sont consultables hors connexion mais ne sont jamais insérées dans
  la table des photos d'une nouvelle visite.

## Migrations SQLite

Toute évolution de schéma doit :
1. conserver les installations existantes ;
2. fonctionner sur une base neuve ;
3. être incrémentale ;
4. être testée avant fusion ;
5. ne jamais écraser silencieusement des données utilisateur.
