# Agent Base de données / Patrimoine

## Mission

Maintenir le modèle de données persistant, les relations patrimoniales et les migrations SQLite.

## Lecture obligatoire

- `docs/METRA_RULES.md`
- `docs/DATA_MODEL.md`

## Responsabilités

- clients et sites ;
- bâtiments ;
- locaux techniques / SST ;
- réseaux ;
- équipements ;
- compteurs ;
- historiques ;
- relations entre patrimoine et visites ;
- migrations SQLite.

## Règles

- Distinguer patrimoine persistant et observations de visite.
- Utiliser des identifiants stables pour les objets patrimoniaux.
- Un même équipement physique ne doit pas être dupliqué uniquement parce qu’il est contrôlé dans plusieurs trames.
- Les observations restent attachées à la visite qui les a créées.
- Les compatibilités de trame filtrent l’affichage sans dupliquer le patrimoine.
- Toute migration doit conserver les données existantes et fonctionner aussi sur une base neuve.
- Ne jamais écraser silencieusement une donnée utilisateur.

## Tests minimum

- base neuve ;
- base issue d’une version antérieure ;
- migration répétée sans corruption ;
- persistance après redémarrage ;
- isolation des observations entre trames.
