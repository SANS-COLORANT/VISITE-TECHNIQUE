# REMAR — compteurs multilignes et photos libres (27/10/2026)

Cette évolution est isolée sur la branche `feat/remar-meters-free-photos-20261027`, issue de la PR #105. Ne pas fusionner directement dans `native-android` ni désinstaller MÉTRA pour l'essayer.

## Compteurs REMAR

- Dans **Compteurs et températures > Compteur**, chaque ligne « Compteur Gaz », « Compteur d'énergie », « Compteur ECS » et « Compteur appoint » accepte **Ajouter** pour créer autant de compteurs individuels que nécessaire.
- Chaque compteur reçoit un nom modifiable, un index et une photo ; sa destination reste celle du champ REMAR d'origine.
- Une ancienne valeur isolée en `champs_visite` est préservée lors du premier ajout : elle devient le premier compteur, puis on crée une ligne vierge supplémentaire. Aucun champ d'historique n'est effacé.
- Export Excel et Intranet : plusieurs compteurs liés à la même destination deviennent une **seule cellule**, chaque compteur sur sa ligne `Nom : index unité`.
- Import Excel et préparation Intranet : chaque ligne non vide de la cellule devient **un compteur distinct**, nom, valeur, unité et destination conservés. Sauts de ligne doubles / vides ignorés, premier relevé conservé en champ historique pour compatibilité.
- Les modèles REMAR et les cellules Excel ne sont pas modifiés ; l'export Intranet demeure conditionné à l'existence d'une vraie trame compatible sur le serveur.

## Photo libre

- La barre inférieure Visite propose directement **Photo libre** au lieu de Mode Photo. L'appareil photo s'ouvre ; la photo apparaît dans l'onglet **Photos > Libres**, sans créer de réserve.
- Les photos sont nommées selon le circuit habituel client/site/local/date/heure ; leur légende par défaut est **Libre**.
- Toucher une photo dans **Photos** permet de **Modifier son libellé**. Le texte saisi est sauvegardé dans SQLite en préservant le nom de fichier interne et servira dans les prochains PDF/Word et, si la photo n'est pas encore envoyée, dans la description Intranet.
- **Libres = locales uniquement par défaut** : aucune sortie PDF/Word, aucun choix de couverture et **aucun envoi Intranet**. L'absence de métadonnée d'une ancienne photo libre exclut aussi l'export.
- Bouton **Intégrer** dans la visionneuse, avec confirmation explicite : la photo devient disponible pour les rapports et l'Intranet. Le bouton **Exclure** rétablit local-only tant que l'envoi n'a pas eu lieu.
- Photos rattachées à un équipement, une réserve ou un contrôle : anciens comportements inchangés (par défaut exportables).
- Une photo libre envoyée avant la migration n'est pas supprimée du serveur. Une légende déjà envoyée n'est pas modifiable sur l'Intranet sans route API de modification : l'écran l'indique honnêtement.

## Migration SQLite non destructive

- `048_photo_local_visibility` ajoute deux indicateurs non destructifs : `photos.inclure_export` (0/1) et `photos.libelle_personnalise` (0/1). Seuls les libellés réellement modifiés par l’utilisateur remplacent les légendes déduites auparavant, pour préserver les anciens rapports.
- Les anciennes photos sans `entite_key` deviennent locales par défaut ; les photos rattachées restent exportables.
- Les fichiers originaux et URI ne sont pas modifiés. Les tâches d'envoi de photos libres non synchronisées sont retirées ; les reçus déjà synchronisés sont conservés.
- Les photos capturées à partir de maintenant enregistrent elles-mêmes le choix initial (0 si Libre, 1 si rattachée).

## Recettes à valider sur tablette, sans toucher aux données professionnelles

1. Importer un ancien classeur REMAR dont un compteur contient 3 lignes (dont une ligne vide) : 3 compteurs, pas 1.
2. Ajouter 3 compteurs Gaz, modifier leurs noms et index ; exporter Excel : **la cellule C existante contient 3 lignes** ; la réimporter et contrôler les 3 compteurs.
3. Si trame serveur REMAR existe, envoyer vers Intranet ; une seule ligne/critère serveur, description multi-lignes, sans champs ICPE détournés.
4. Prendre deux photos Libres puis fermer/réouvrir : elles restent en local, visibles dans Photos, non envoyées en Wi-Fi et exclues des rapports.
5. Renommer une photo libre et une photo d'équipement, réouvrir, produire un PDF, contrôler les libellés.
6. Intégrer une seule libre : elle est incluse dans un nouveau rapport et éligible à la file Intranet ; l'autre reste strictement privée. Exclure avant envoi et recontrôler.
7. Insérer une ancienne tâche Intranet privée en attente et relancer le processeur : **zéro transfert**.
8. Non-régression sur ICPE, VMC, Réseau de chaleur, Pré-allumage, import/export Excel, 457 photos PDF, navigation, offline, backup/restauration et toutes les photos historiques.

Limite explicite : aucune modification sur le serveur Intranet et aucune API de suppression/renommage distant n'est inventée. La nouvelle branche construit et teste un bundle JS, pas un APK Android signé ; un build natif et une recette physique seront nécessaires avant installation en production.
