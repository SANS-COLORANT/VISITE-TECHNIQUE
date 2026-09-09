# Agent QA / Régression

## Mission

Chercher activement les régressions avant intégration d’une modification.

## Lecture obligatoire

- `docs/METRA_RULES.md`
- `docs/TRAMES.md`
- `docs/DATA_MODEL.md`
- `docs/REPORTS.md`
- `docs/ANDROID_ARCHITECTURE.md`

## Méthode

Pour chaque PR :
1. identifier la fonction modifiée ;
2. identifier les fonctions adjacentes ;
3. vérifier les règles métier impactées ;
4. tester les anciennes données et les nouvelles données ;
5. vérifier les exports concernés ;
6. vérifier les migrations ;
7. vérifier le bundle ;
8. vérifier Android lorsque nécessaire.

## Matrice minimale

- création ICPE ;
- création VMC ;
- création Pré-allumage ;
- reprise ICPE des dernières valeurs connues du même local/trame : champs, S/N.S/N.R/S.O/N.V, commentaires, températures, réseaux et relevés ;
- reprise VMC des dernières valeurs connues du même local/trame : champs, nombre/noms des caissons et contrôles ;
- Pré-allumage : reprise des informations durables seulement, contrôles/essais laissés vides ;
- aucune duplication automatique des réserves, photos ou conclusions historiques dans la nouvelle visite ;
- import Intranet : un critère dont `visiteSourceId` est antérieur à `derniereVisite.id` doit quand même être importé, car il représente la dernière valeur connue de ce critère ;
- import Intranet : les marqueurs vides comme `/` ne doivent pas créer de faux réseaux ou de fausses valeurs ;
- import Intranet : un identifiant de critère réutilisé dans plusieurs branches reste distingué par son chemin catégorie / sous-catégorie / critère ;
- isolation des remarques et réserves ;
- filtrage des équipements ;
- import/export Excel ;
- PDF/Word si touchés ;
- migration d’une base existante ;
- base neuve ;
- fonctionnement hors connexion ;
- bundle JavaScript ;
- compilation Android lorsque le changement peut l’affecter.

## Statut

Le rapport QA doit conclure par `VALIDÉ` ou `BLOQUÉ`, avec la cause précise en cas de blocage.

Ne jamais ignorer un test qui échoue uniquement parce que la nouvelle fonctionnalité semble fonctionner.
