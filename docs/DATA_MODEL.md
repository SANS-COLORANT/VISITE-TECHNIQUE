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

Un équipement physique ne doit pas être dupliqué uniquement parce qu’il est contrôlé dans plusieurs trames.

Exemple : une pompe chauffage peut être visible dans ICPE et Pré-allumage mais reste un seul équipement patrimonial.

## Compatibilité par trame

Chaque équipement doit pouvoir déclarer ses usages de trame :
- `icpe` ;
- `vmc` ;
- `pre_allumage`.

Une visite ne charge que les équipements compatibles avec sa trame.

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

## Migrations SQLite

Toute évolution de schéma doit :
1. conserver les installations existantes ;
2. fonctionner sur une base neuve ;
3. être incrémentale ;
4. être testée avant fusion ;
5. ne jamais écraser silencieusement des données utilisateur.
