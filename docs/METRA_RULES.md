# METRA — Règles fonctionnelles fondamentales

Ce document est la référence commune pour tout développement humain ou assisté par IA sur METRA.

## Règles de données

1. Le patrimoine du site est commun aux différentes trames.
2. Les remarques, commentaires, réserves, photos de contrôle et résultats de contrôle appartiennent à une visite et à sa trame.
3. Une visite VMC ne doit afficher ni exporter des remarques ICPE ou Pré-allumage.
4. Une visite ICPE ne doit afficher ni exporter des remarques VMC ou Pré-allumage.
5. Une visite Pré-allumage ne doit afficher ni exporter des remarques ICPE ou VMC.
6. Les équipements peuvent être communs dans le patrimoine, mais une trame n’affiche que les équipements qui lui sont applicables.
7. Les contrôles sont propres à chaque trame, même lorsqu’ils portent sur un même équipement patrimonial.
8. Un contrôle satisfaisant doit pouvoir générer un commentaire positif rédigé.
9. Une réserve n’est créée que lorsqu’une action corrective est justifiée.
10. Les données permanentes proviennent du patrimoine partagé ; les mesures et constats restent liés à leur visite d’origine.
11. Pour ICPE et VMC, une nouvelle visite du même local et de la même trame est préremplie à partir de la dernière visite connue : champs, avis `S` / `N.S` / `N.R` / `S.O` / `N.V`, commentaires de contrôle, températures, réseaux et relevés disponibles. Ce préremplissage reste modifiable immédiatement par le technicien.
12. Pré-allumage est l’exception : seules les informations durables explicitement déclarées `stable` / `carryForward` et la structure patrimoniale sont reprises ; les contrôles et essais doivent être refaits et restent vides à l’ouverture de la nouvelle visite.
13. Les réserves, photos et conclusions d’une ancienne visite ne sont jamais recréées automatiquement comme observations de la nouvelle visite, même si un avis ou un commentaire de contrôle est prérempli.
14. L’application terrain doit rester utilisable hors connexion.

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
