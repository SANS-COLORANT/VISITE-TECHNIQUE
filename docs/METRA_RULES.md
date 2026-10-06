# METRA — Règles fonctionnelles fondamentales

Ce document est la référence commune pour tout développement humain ou assisté par IA sur METRA.

## Règles de données

1. Le patrimoine du site est commun aux différentes trames.
2. Chaque saisie conserve sa visite et sa trame d’origine, mais les concepts communs sont maillés par une identité sémantique indépendante de la trame afin d’être retrouvés et proposés dans une autre trame du même local.
3. Une trame reste responsable de son affichage et de son export : seules les informations ayant un concept correspondant dans la trame cible sont projetées comme préremplissage ; les autres restent consultables dans l’historique.
4. Les réserves non levées constituent un suivi du local : elles traversent les trames jusqu’à leur levée ou leur annulation, sans perdre leur visite/trame d’origine.
5. Les photos et conclusions restent historisées dans leur visite source et peuvent être consultées comme références ; elles ne sont pas dupliquées silencieusement dans une nouvelle visite.
6. Les équipements peuvent être communs dans le patrimoine, mais une trame n’affiche que les équipements qui lui sont applicables.
7. Les contrôles sont propres à chaque trame, même lorsqu’ils portent sur un même équipement patrimonial.
8. Un contrôle satisfaisant doit pouvoir générer un commentaire positif rédigé.
9. Une réserve n’est créée que lorsqu’une action corrective est justifiée.
10. Les données permanentes proviennent du patrimoine partagé ; les mesures et constats restent liés à leur visite d’origine.
11. Pour ICPE, VMC et Réseau de chaleur, une nouvelle visite d’un local est préremplie à partir des dernières valeurs connues de chaque concept compatible, quelle que soit la trame technique qui les a produites : champs, avis `S` / `N.S` / `N.R` / `S.O` / `N.V`, commentaires de contrôle, températures, réseaux et relevés disponibles. Lorsque ces valeurs viennent de `GET /api/clients/{idclient}/preparation-visites`, chaque critère est déjà la dernière valeur connue de ce critère ; `visiteSourceId` indique seulement la visite d’origine et peut être antérieur à `derniereVisite.id`. Il ne doit jamais servir à exclure la valeur du préremplissage. Ce préremplissage reste modifiable immédiatement par le technicien.
12. Pré-allumage est l’exception : seules les informations durables explicitement déclarées `stable` / `carryForward` et la structure patrimoniale sont reprises ; les contrôles et essais doivent être refaits et restent vides à l’ouverture de la nouvelle visite.
13. Les réserves non levées d’une ancienne visite du même local sont reprises dans la nouvelle visite pour assurer leur suivi, même lorsque la nouvelle visite utilise une autre trame. Les réserves marquées `Terminé` ou `Annulé`, les photos et les conclusions historiques restent dans l’historique et ne sont pas recréées comme nouvelles observations.
14. Les marqueurs techniques de valeur vide reçus de l’Intranet, notamment `/`, sont traités comme vides et ne doivent pas créer de faux réseaux, compteurs, champs ou contrôles.
15. Lorsqu’un identifiant de critère est réutilisé dans plusieurs branches d’une trame, son identité locale doit conserver le chemin catégorie / sous-catégorie / critère afin d’éviter toute collision.
16. L’application terrain doit rester utilisable hors connexion.

## Avis de contrôle

Les codes de référence sont : `S`, `N.S`, `N.R`, `S.O`, `N.V`.

- `S` : satisfaisant / fonctionnel.
- `N.S` : non satisfaisant / anomalie.
- `N.R` : non réalisé / non relevé / non testable selon le contexte, avec motif lorsque nécessaire.
- `S.O` : sans objet / non présent.
- `N.V` : non visible / inaccessible visuellement.

Tous les avis doivent pouvoir produire un commentaire de constat. Les réserves sont distinctes des commentaires.

## Compatibilité des trames

Une modification d’une trame ne doit pas modifier implicitement le comportement des autres trames.

Toute modification doit vérifier au minimum :
- ICPE ;
- VMC ;
- Pré-allumage ;
- import/export Excel ;
- PDF/Word lorsque concernés ;
- migrations SQLite ;
- bundle JavaScript ;
- compilation Android lorsque du code natif ou des dépendances sont touchés.

## Git et intégration

- Les développements se font sur une branche dédiée.
- Une PR doit être ouverte vers `native-android`.
- Les agents spécialisés ne poussent pas directement sur `native-android`.
- Le QA doit vérifier la PR avant fusion lorsque le changement touche une fonction métier, les données, les exports ou Android.
- Un build qui échoue ne doit pas être relancé aveuglément : la première erreur significative doit être identifiée.
