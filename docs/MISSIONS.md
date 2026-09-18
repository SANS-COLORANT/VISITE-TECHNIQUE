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

## Règle de séparation avec Visites techniques

Les recettes Missions ne doivent **jamais** recopier automatiquement les points de contrôle de METRA Visites techniques.
Une Mission qui se déroule dans une chaufferie, une sous-station ou sur un équipement déjà connu reste une Mission :
son interface dépend de son objectif (audit, passation, étude, OPR, mesure, expertise...), pas de la trame récurrente du module Visites techniques.

Les composants techniques génériques peuvent être partagés (photo, document, équipement, mesure, export), mais :
- aucun point récurrent n'est injecté ;
- aucun historique Intranet n'est lu ;
- aucune synchronisation Missions ↔ Intranet n'est créée.

Les recettes VMC/CTA spécifiques de Missions restent volontairement différées à ce stade.

## Familles et recettes initiales

Familles documentées :

1. Étude / Audit ;
2. Travaux / Chantier ;
3. Suivi ponctuel ;
4. Campagne / Multi-sites ;
5. Contrôle / Conformité.

Les recettes servent uniquement à proposer les éléments utiles au terrain. Elles doivent rester modifiables et extensibles.

Les types actuellement préparés couvrent notamment : audit énergétique, diagnostic technique, diagnostic ECS, climatisation/PAC, GTB/GTC, diagnostic ciblé, étude de rénovation, AMO/MOE/DET, commissioning, OPR/réception, levée de réserves, passation, contrôle ponctuel d'exploitation, expertise/sinistre, inventaire patrimonial, campagnes de mesures et campagnes multi-sites.

Chaque recette propose trois niveaux adaptatifs :
- **Rapide** : constat essentiel et saisie minimale terrain ;
- **Standard** : mesures, comparaisons et éléments usuels ;
- **Expert** : investigation, hypothèses, calculs, essais et analyse approfondie.

Ces niveaux sont définis par mission/sous-mission et non par un nombre fixe de champs.

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

## Architecture métier V2

Le schéma v41 ajoute des objets transversaux, indépendants des Visites techniques :
- Volet / axe de Mission ;
- Sujet ;
- Constat factuel ;
- Hypothèse ;
- Décision ;
- Action (responsable, échéance, coût, imputation, progression) ;
- Référence (théorique, contractuelle, documentaire, constructeur, consigne...) ;
- Série de mesures et détails de mesure ;
- Protocole, étape, exécution et résultat d'essai ;
- Document attendu ;
- Validation / VISA ;
- Scénario et actions de scénario ;
- Géométrie Point / Ligne / Polygone (plan ou SIG) ;
- Relation entre équipements pour les synoptiques techniques ;
- Calcul avec formule, entrées et hypothèses ;
- Annotation photo non destructive ;
- Signature ;
- Cycle de vie d'un équipement pendant un projet ;
- Provenance d'une donnée ;
- Profil, sections éditables et sorties de rapport ;
- Historique d'import Excel et conservation brute des sources.

La règle de conception reste : **saisi une fois, réutilisé partout**.

## Import / Export Excel

Toute donnée structurée Missions doit pouvoir **entrer et ressortir via Excel**.

Le classeur canonique METRA Missions est versionné et relationnel. Il contient les données du noyau et du schéma métier V2. Il peut être réimporté afin de restaurer ou fusionner les données par identifiants stables.

Un classeur Excel externe non-METRA peut également être importé. Afin de ne jamais perdre d'information avant mapping :
- toutes les feuilles sont lues ;
- toutes les lignes non vides sont conservées ;
- les formules Excel détectées sont conservées avec la ligne source ;
- le fichier, la feuille et le numéro de ligne restent traçables ;
- les problèmes/doublons/mappings à traiter sont consignés dans le journal d'import.

Le mapping métier progressif d'un classeur externe peut ensuite transformer ces sources en Sites, Équipements, Mesures, Actions, etc. sans perdre la donnée d'origine.

Toute donnée structurée Missions doit pouvoir ressortir sur PC.

L'export Excel est relationnel et lié par identifiants stables. Le format V2 comprend les feuilles cœur ci-dessous, puis les feuilles métier V2 :

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

Les feuilles métier V2 couvrent notamment : Volets, Sujets, Constats, Hypothèses, Décisions, Actions, Références, Séries de mesures, Essais, Documents attendus, Validations, Scénarios, Géométries, Relations d'équipements, Calculs, Annotations, Signatures, Cycle de vie, Provenance, Rapports et journaux d'import.

Les fichiers lourds et images ne sont pas incorporés physiquement dans le classeur ; l'Excel conserve leurs références/chemins.

## Rapports et synthèses

La donnée métier reste la source de vérité ; le texte de rapport est une présentation éditable.
Le schéma prévoit :
- plusieurs profils de rapport ;
- sections ordonnées, masquables et modifiables dans METRA ;
- portée globale / site / bâtiment / installation ;
- sorties Word/PDF et rapports globaux ou individuels ;
- conservation du lien entre contenu généré et données structurées.

## Mesures, calculs et essais

Une valeur peut provenir du terrain, d'un document, de la GTC, d'un compteur, d'une simulation, d'un calcul ou d'une estimation.
Les références sont séparées des mesures afin de permettre :
- théorique ↔ mesuré ;
- contractuel ↔ mesuré ;
- document ↔ terrain ;
- avant ↔ après ;
- campagne précédente ↔ actuelle ;
- comparaison de plusieurs sources.

Les valeurs atypiques sont signalées **À contrôler** ; METRA ne transforme jamais automatiquement un écart mathématique en conclusion technique définitive.

Les calculs enregistrent la formule, les entrées, les hypothèses et le résultat. L'interface utilise une indication compacte de type calculatrice pour ouvrir le détail.

## Plans, géométries et relations techniques

Le noyau prévoit une géométrie générique Point / Ligne / Polygone et un espace de relations entre équipements.
Cela doit permettre progressivement :
- annotations et mesures sur PDF ;
- localisation de réserves et équipements ;
- réseaux tracés ;
- cartographie multi-sites ;
- échanges GeoJSON / SIG ;
- synoptiques cliquables et très visuels ;
- relations telles que UE ↔ UI, production ↔ circuit, automate ↔ sonde/actionneur.

Les traitements lourds doivent rester chargés à la demande afin de préserver la fluidité tablette.

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
- base neuve schema 41 ;
- migration schema 40 → 41 ;
- import du classeur canonique complet ;
- import d'un classeur Excel externe avec conservation brute des lignes/formules ;
- export Excel structuré ;
- listes longues / fonctionnement hors connexion ;
- compilation Android lorsque la PR est prête à fusionner.
