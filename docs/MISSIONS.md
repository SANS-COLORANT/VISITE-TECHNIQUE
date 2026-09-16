# METRA — Module Missions

## Séparation fonctionnelle absolue

METRA contient deux univers qui ne doivent pas être confondus :

- **Visites techniques** : suivi récurrent du patrimoine, année après année, connecté au référentiel et aux échanges Intranet.
- **Missions** : intervention ponctuelle avec un objectif et une fin, même lorsqu'elle dure plusieurs mois ou années.

Le module **Missions est totalement indépendant de l'Intranet** :

- aucune lecture de clients/sites/patrimoine Intranet ;
- aucune réutilisation automatique de données Intranet ;
- aucune colonne `api_*` / `remote_*` dans le schéma Missions ;
- aucune remontée ou synchronisation Missions vers l'Intranet.

Les clients, sites, localisations, équipements, visites, points et documents Missions sont des objets locaux Missions distincts.

## Activation LAB et navigation

Missions est **désactivé par défaut**.

1. **LAB METRA n'est jamais affiché sur l'écran d'accueil.** Son accès se fait uniquement depuis **Paramètres**.
2. Dans Paramètres, l'utilisateur ouvre LAB METRA puis maintient **LAB METRA pendant 2 secondes** pour révéler le réglage Missions.
3. Ce geste ne doit jamais activer Missions : il révèle uniquement son interrupteur.
4. L'utilisateur doit ensuite activer explicitement l'interrupteur **Missions**.
5. Lorsque Missions est désactivé, toutes ses entrées d'interface sont masquées, sans supprimer les données déjà enregistrées.
6. Lorsque Missions est actif, l'accès principal se fait depuis l'accueil Visites techniques par un **swipe vers la droite**. Il n'y a pas de bouton Missions permanent sur l'accueil.
7. L'espace Missions possède son propre tableau de bord, sa propre palette verte et sa propre hiérarchie d'information. Il ne doit pas reproduire l'accueil Client/Patrimoine des Visites techniques.
8. Depuis le tableau de bord Missions, un swipe inverse permet de revenir aux Visites techniques.

## Saisie terrain non bloquante

Une visite Mission peut volontairement rester incomplète.

- Les recettes proposent des contrôles/champs, elles ne les imposent pas tous.
- Un champ vide est autorisé.
- L'utilisateur peut quitter une visite et la reprendre plus tard.
- Une visite peut être terminée avec des rubriques non renseignées.
- La progression éventuelle est informative, jamais une condition de sortie.
- Les valeurs `non concerné` et `non vérifiable` ne doivent pas être confondues avec une absence de saisie.

## Points libres

La recette n'est jamais une limite. À tout moment l'utilisateur peut ajouter un Point non prévu.

Types de base :

- réserve ;
- action ;
- demande ;
- contrôle ;
- décision ;
- information.

Cycle générique d'un Point :

- ouvert ;
- en cours ;
- en attente ;
- à contrôler ;
- clôturé ;
- sans suite.

Les qualifications contractuelles telles que `P2`, `P3`, `Hors marché` ou autres restent des qualifications de Point/prestation et ne deviennent pas des types de Mission.

## Familles et recettes initiales

Familles documentées :

1. Étude / Audit ;
2. Travaux / Chantier ;
3. Suivi ponctuel ;
4. Campagne / Multi-sites ;
5. Contrôle / Conformité.

Les recettes servent uniquement à proposer les éléments utiles au terrain. Elles doivent rester modifiables et extensibles.

## Données persistantes

Le noyau Missions repose sur des identifiants locaux stables et une écriture SQLite immédiate :

- Client Mission ;
- Site Mission ;
- lien Mission/Site ;
- Localisation hiérarchique ;
- Mission ;
- Phase ;
- Visite Mission ;
- Point et historique ;
- Acteur ;
- Équipement ;
- Mesure ;
- Photo ;
- Document ;
- Note ;
- valeurs de trame extensibles.

Un objet saisi ne doit pas dépendre de l'état React d'un écran pour survivre à une fermeture de l'application.

## Performance tablette

- Ne jamais charger une Mission complète par défaut.
- Les listes utilisent uniquement les données nécessaires à l'écran courant.
- Les historiques, documents et médias lourds sont chargés à la demande.
- Les photos doivent pouvoir utiliser miniature / aperçu / original séparément.
- Les écrans d'accueil utilisent des compteurs/résumés SQLite plutôt que le contenu complet.
- Une Mission avec plusieurs centaines de Points doit rester fluide.

## Export Excel

Toute donnée structurée Missions doit pouvoir ressortir sur PC.

L'export Excel est relationnel et lié par identifiants stables. Les feuilles initiales sont :

- Mission ;
- Clients ;
- Sites ;
- Mission_Sites ;
- Localisations ;
- Phases ;
- Visites ;
- Points ;
- Historique_Points ;
- Point_Acteurs ;
- Acteurs ;
- Equipements ;
- Mesures ;
- Photos ;
- Documents ;
- Notes ;
- Valeurs_Trames.

Les fichiers lourds et images ne sont pas incorporés physiquement dans le classeur ; l'Excel conserve leurs références/chemins.

## Validation minimale

Avant fusion d'une évolution Missions, vérifier au minimum :

- Missions absent et OFF sur installation neuve ;
- LAB METRA absent de l'accueil et accessible depuis Paramètres uniquement ;
- déverrouillage LAB 2 secondes sans activation automatique ;
- activation/désactivation persistante ;
- swipe accueil → Missions uniquement si la fonctionnalité est active ;
- tableau de bord Missions visuellement et fonctionnellement distinct des Visites techniques ;
- création d'un brouillon partiel ;
- création d'une visite avec champs vides ;
- reprise après fermeture/redémarrage ;
- ajout d'un Point non prévu ;
- isolation totale vis-à-vis de l'Intranet ;
- migration depuis schema 39 ;
- base neuve schema 40 ;
- export Excel structuré ;
- listes longues / fonctionnement hors connexion ;
- compilation Android lorsque la PR est prête à fusionner.
