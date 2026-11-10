# METRA - Correction des alias de stockage Intranet (2026-11-10)

Incident Atlas Rebeval : un champ ECS peut exister sous regulation.reseau_ecs et regulation.r_seau_ecs.
Le découpage historique des accents des titres Excel diffère des clés stables des panneaux terrain.

Le correctif centralise les identités de Cascade chaudières, Réseau ECS, Relevés et Températures.
Il s'applique à tous les champs et contrôles des trames ICPE, RCU, VMC et trames déclarées.
Les saisies futures utilisent les identifiants métiers des panneaux. Les anciens alias restent lisibles.
Lorsqu'un ancien et un nouvel alias sont différents, la clé du panneau terrain est privilégiée
et TOUTES les variantes sont sauvegardées dans des notes Intranet, sans supprimer les lignes SQLite.
Si l'archivage des variantes n'est pas possible, l'envoi reste bloqué.
L'absence de provenance temporelle interdit d'affirmer que la valeur privilégiée est la plus récente.
Toute discordance historique reste vérifiable par le technicien à partir des notes.

Tests : node --test tests/intranetStorageAliases.test.mjs
Validation terrain + vraie API Symfony + compilation native APK nécessaires avant diffusion.
Les envois déjà figés en file ne sont pas réécrits en cas de tentative HTTP incertaine.
