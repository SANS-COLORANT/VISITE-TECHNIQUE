# METRA — Architecture & règles verrouillées

> Document maître du projet. Ce fichier complète `docs/MISSIONS.md` et sert de référence avant toute évolution importante.
>
> Statuts utilisés :
> - **VERROUILLÉ** : ne doit pas être modifié sans décision explicite.
> - **VALIDÉ** : attendu dans la cible produit.
> - **DIFFÉRÉ** : prévu mais volontairement non développé dans le lot courant.
> - **À CONSOLIDER** : architecture prévue, UX/finalisation restant à préciser.

## 1. Vision générale

### 1.1 Deux univers distincts — VERROUILLÉ

METRA comporte deux univers fonctionnels qui ne doivent pas être confondus :

1. **METRA Visites techniques**
   - visites techniques récurrentes ;
   - trames récurrentes métier ;
   - historique et fonctionnement liés au référentiel Intranet ;
   - exemples : visites récurrentes chaufferie, sous-station, VMC, pré-allumage/remise en chauffe.

2. **METRA Missions**
   - dossiers ponctuels, campagnes, études, audits, passations, travaux, OPR, essais, expertises, mesures ;
   - propre référentiel local Missions ;
   - aucune dépendance au référentiel Intranet.

### 1.2 Règle absolue de séparation — VERROUILLÉ

METRA Missions :
- ne lit pas les points de contrôle de METRA Visites techniques ;
- ne recopie pas automatiquement les trames récurrentes ;
- ne lit pas l’historique Intranet ;
- ne synchronise aucune donnée vers l’Intranet ;
- ne remonte ni clients, ni sites, ni documents, ni patrimoine, ni points Missions vers l’Intranet ;
- peut partager des **composants techniques génériques** de l’application : photo, mesure, document, équipement, stockage, export, rendu ;
- possède son propre modèle de données et son propre référentiel métier.

Une Mission réalisée dans une chaufferie **n’est pas une visite chaufferie récurrente**. Son interface dépend de l’objectif de la Mission.

### 1.3 Principe produit — VERROUILLÉ

**Saisi une fois, réutilisé partout.**

Une information saisie, importée ou calculée doit pouvoir alimenter, selon son contexte :
- inventaire ;
- fiche équipement ;
- mesure ;
- calcul ;
- constat ;
- action ;
- plan / synoptique ;
- photo ;
- rapport ;
- Excel ;
- comparaison future.

Aucune ressaisie ne doit être imposée uniquement pour produire un livrable.

## 2. Architecture technique

### 2.1 Offline-first — VERROUILLÉ

METRA doit rester pleinement utilisable hors connexion :
- stockage local des données ;
- stockage local des médias nécessaires au terrain ;
- aucune fonctionnalité essentielle bloquée par l’absence d’Internet ;
- synchronisations ou enrichissements distants uniquement en complément.

### 2.2 Performance tablette — VERROUILLÉ

Toute évolution Missions doit :
- minimiser les chargements massifs ;
- utiliser listes virtualisées pour gros volumes ;
- charger séries, gros documents, images HD et objets lourds seulement à la demande ;
- générer aperçus / miniatures pour les photos ;
- éviter de monter simultanément des centaines d’objets dans l’UI ;
- maintenir les données de voisinage utiles en mémoire seulement lorsque cela améliore réellement le swipe/navigation.

### 2.3 PC + tablette — VALIDÉ

La même base logique doit être exploitable :
- tablette : terrain, capture, mesures, essais, photos, plans, réserves ;
- PC : préparation, imports, cartographie lourde, scénarios, validation documentaire, édition de rapports, consolidation multi-sites ;
- mêmes objets métier, aucun doublon de saisie.

## 3. Modèle de données transversal Missions

### 3.1 Noyau — VALIDÉ

Le modèle V2 inclut :
- Mission ;
- Client Missions ;
- Site Missions ;
- Localisation : bâtiment, niveau, local, zone ;
- Phase ;
- Occurrence / visite ;
- Acteur ;
- Équipement ;
- Point / réserve ;
- Historique de point ;
- Mesure ;
- Note ;
- Photo ;
- Document ;
- Valeur de recette de Mission.

### 3.2 Architecture métier V2 — VALIDÉ

Objets transversaux complémentaires :
- Volet / axe de Mission ;
- Sujet ;
- Constat factuel ;
- Hypothèse ;
- Décision ;
- Action ;
- Référence de comparaison ;
- Série de mesures ;
- Protocole d’essai ;
- Étape d’essai ;
- Exécution d’essai ;
- Résultat d’essai ;
- Document attendu ;
- Validation / VISA ;
- Scénario ;
- Action de scénario ;
- Géométrie Point / Ligne / Polygone ;
- Relation entre équipements ;
- Calcul ;
- Annotation photo ;
- Signature ;
- Cycle de vie d’un équipement ;
- Provenance ;
- Profil de rapport ;
- Section de rapport ;
- Sortie de rapport ;
- Historique d’import Excel ;
- Problème / avertissement d’import ;
- Ligne Excel brute conservée.

## 4. Hiérarchie technique

### 4.1 Localisation — VALIDÉ

Une Mission peut descendre jusqu’à :
Site → Bâtiment → Niveau → Local / Zone → Installation → Système → Réseau / Circuit → Équipement → Composant.

Le niveau de détail dépend de la Mission.

### 4.2 Équipements incomplets — VERROUILLÉ

La création d’un équipement ne doit jamais être bloquée parce que sa fiche est incomplète.

Un équipement peut être :
- identifié partiellement ;
- enrichi plus tard ;
- importé depuis un document ;
- confirmé ou corrigé sur le terrain.

### 4.3 Individualisation ou groupe — VALIDÉ

Un élément peut être saisi :
- individuellement ;
- comme groupe / quantité ;
- puis individualisé plus tard si une Mission l’exige.

## 5. Origine et qualité des données

### 5.1 Origine — VALIDÉ

Une donnée peut être :
- terrain ;
- document ;
- exploitant ;
- GTC/GTB ;
- compteur ;
- calcul ;
- simulation ;
- estimation ;
- import Excel ;
- hypothèse.

### 5.2 Provenance — VERROUILLÉ

Une donnée importée doit pouvoir conserver :
- fichier source ;
- feuille ;
- ligne / cellule ;
- valeur originale ;
- formule originale si disponible ;
- date / lot d’import.

La normalisation METRA ne doit jamais détruire la valeur source.

### 5.3 Fiabilité — VALIDÉ

Lorsque pertinent :
- confirmée ;
- à confirmer ;
- estimée ;
- simulée ;
- calculée.

## 6. Import / Export Excel

### 6.1 Principe — VERROUILLÉ

**Toutes les données structurées de METRA Missions doivent pouvoir être exportées et réimportées via Excel.**

### 6.2 Classeur canonique — VALIDÉ

Le format `METRA_MISSIONS_XLSX_V2` :
- est versionné ;
- conserve les identifiants relationnels ;
- couvre le noyau et les objets V2 ;
- peut être réimporté par identifiants stables ;
- protège contre l’import d’un schéma plus récent que l’application.

### 6.3 Import Excel externe — VALIDÉ

Un fichier Excel externe doit pouvoir être importé même s’il ne respecte pas le format METRA.

Règles :
- lecture de toutes les feuilles ;
- conservation des lignes non vides ;
- conservation des formules détectées ;
- création d’un lot d’import ;
- journalisation des problèmes ;
- auto-mapping uniquement lorsque les colonnes sont suffisamment reconnaissables ;
- conservation intégrale de la source avant mapping ;
- pas de suppression silencieuse des informations inconnues.

### 6.4 Auto-mapping initial — VALIDÉ

Les colonnes clairement reconnues peuvent alimenter automatiquement :
- Sites ;
- Bâtiments / niveaux / locaux ;
- Équipements ;
- Marques / modèles / années / états ;
- quantités / réseaux ;
- Actions ;
- responsables ;
- échéances ;
- coûts ;
- imputations.

Les lignes ambiguës restent conservées et sont signalées pour mapping.

### 6.5 Détection d’incohérences — VALIDÉ

L’import doit progressivement détecter :
- doublons probables ;
- noms proches ;
- lignes sans Site fiable ;
- valeurs incompatibles ;
- feuilles de synthèse sans détail correspondant ;
- données de même objet contradictoires.

## 7. Recettes de Mission et modes de saisie

### 7.1 Recettes — VERROUILLÉ

Une Mission est configurée par :
**Métier → famille → type de Mission → sous-mission → phase → objet technique.**

Pas 24 écrans indépendants.

### 7.2 Modes Rapide / Standard / Expert — VERROUILLÉ

Les trois modes changent selon la Mission.

- **Rapide** : constat essentiel, capture minimale.
- **Standard** : mesures, comparaisons, informations usuelles.
- **Expert** : investigation, hypothèses, calculs, essais, scénarios.

Ils ne correspondent pas à un nombre fixe de champs.

### 7.3 Recettes Missions présentes dans le lot V2

Familles :
- Étude / Audit ;
- Travaux / Chantier ;
- Suivi ponctuel ;
- Campagne / Multi-sites ;
- Contrôle / Conformité.

Types préparés :
- audit énergétique ;
- audit / diagnostic technique CVC ;
- diagnostic ECS ;
- diagnostic climatisation / PAC ;
- diagnostic GTB/GTC ;
- diagnostic ciblé ;
- étude CVC ;
- étude rénovation/remplacement ;
- AMO travaux ;
- MOE travaux ;
- DET ;
- commissioning ;
- OPR/réception ;
- levée de réserves ;
- passation travaux → exploitant ;
- suivi technique ciblé ;
- contrôle ponctuel d’exploitation ;
- plan d’action ;
- suivi sanitaire ponctuel ;
- expertise/sinistre ;
- campagne technique ;
- campagne de mesures ;
- inventaire patrimonial ;
- inventaire/passation ;
- état des lieux multi-sites ;
- audit multi-sites ;
- contrôles ciblés.

### 7.4 VMC / CTA Missions — DIFFÉRÉ

Les recettes spécifiques Missions VMC/CTA sont volontairement laissées de côté dans ce lot.
Cette décision ne concerne pas METRA Visites techniques.

## 8. Terrain

### 8.1 Héritage automatique — VERROUILLÉ

Si l’utilisateur est dans :
Mission → Site → Bâtiment → Local → Installation → Équipement,

tout nouvel objet doit hériter automatiquement du contexte pertinent :
- mesure ;
- photo ;
- document ;
- point ;
- réserve ;
- action ;
- constat.

### 8.2 Saisie rapide — VALIDÉ

Depuis une visite Mission :
- + Point ;
- + Mesure ;
- Photo ;
- + Document ;
- fin de visite.

Aucun champ n’est obligatoirement bloquant.

### 8.3 Fin de visite — VALIDÉ

METRA peut signaler les informations manquantes ou incohérentes mais doit permettre :
**Terminer quand même.**

## 9. Photos

### 9.1 Stockage — VALIDÉ

Les photos Missions :
- sont stockées dans l’espace Missions ;
- ne passent pas par les tables Visites techniques ;
- possèdent original + aperçu + miniature ;
- gardent contexte et horodatage.

### 9.2 Annotations — VALIDÉ / UI À CONSOLIDER

Prévu :
- flèche ;
- cercle ;
- texte ;
- zone ;
- conservation de l’original intact.

## 10. Documents

### 10.1 Documents Mission — VALIDÉ

Tous types de documents peuvent être rattachés à :
- Mission ;
- Site ;
- Visite ;
- Point / réserve.

### 10.2 Documents attendus — VALIDÉ

Statuts possibles à terme :
- présent et à jour ;
- présent mais obsolète ;
- incomplet ;
- à transmettre ;
- introuvable ;
- non existant ;
- reçu ;
- validé.

## 11. Mesures

### 11.1 Deux modèles — VERROUILLÉ

- Mesure ponctuelle ;
- Série de mesures.

### 11.2 Référence séparée — VERROUILLÉ

Une mesure peut être comparée à :
- théorique ;
- contractuel ;
- réglementaire ;
- constructeur ;
- consigne ;
- document ;
- campagne précédente ;
- avant travaux ;
- autre source terrain.

### 11.3 Écarts — VALIDÉ

METRA peut calculer :
- différence absolue ;
- différence relative ;
- delta ;
- moyenne/min/max ;
- autres indicateurs selon recette.

Une valeur atypique est marquée **À contrôler**, jamais transformée automatiquement en conclusion technique définitive.

### 11.4 Instruments — VALIDÉ

L’instrument est optionnel par défaut.
Une recette spécialisée peut le rendre nécessaire, par exemple acoustique.

## 12. Calculs

### 12.1 Bibliothèque — VALIDÉ

Les calculs doivent conserver :
- nom ;
- formule ;
- entrées ;
- hypothèses ;
- unité ;
- résultat ;
- source.

### 12.2 UX — VERROUILLÉ

Une valeur calculée est indiquée de manière compacte, par exemple avec une petite icône calculatrice.
L’utilisateur peut ouvrir le détail et modifier les variables/hypothèses.

## 13. Investigation

### 13.1 Hypothèses — VALIDÉ

Une Mission ciblée peut partir d’un symptôme et suivre plusieurs hypothèses :
- non testée ;
- en cours ;
- probable ;
- écartée ;
- confirmée.

Chaque hypothèse peut avoir :
- constats ;
- mesures ;
- essais ;
- documents ;
- conclusion.

## 14. Actions / réserves / décisions

### 14.1 Différenciation — VERROUILLÉ

- **Constat** : fait observé.
- **Décision** : choix / arbitrage pris.
- **Action** : chose à réaliser.
- **Réserve / Point** : écart à suivre jusqu’à clôture.

### 14.2 Action / Point enrichi — VALIDÉ

Champs prévus :
- responsable / entreprise ;
- action demandée ;
- échéance ;
- priorité ;
- criticité ;
- coût estimatif ;
- imputation / lot ;
- statut ;
- progression ;
- historique ;
- localisation ;
- équipement ;
- photos/documents.

## 15. Essais / commissioning

### 15.1 Moteur d’essais — VALIDÉ

Protocole :
- étapes ;
- comportement attendu ;
- valeur de référence ;
- valeur observée ;
- résultat ;
- commentaire ;
- preuve ;
- point/réserve éventuel.

Résultats :
- OK ;
- Écart ;
- Non testé ;
- Impossible ;
- À reprendre / À contrôler.

## 16. Relations techniques et synoptiques

### 16.1 Règle UX — VERROUILLÉ

**Quand une relation technique peut être comprise plus vite par un schéma que par une liste, METRA doit privilégier le schéma.**

### 16.2 Relations — VALIDÉ

Exemples :
- UE ↔ UI ;
- chaudière ↔ collecteur ↔ circuit ;
- production ECS ↔ colonnes ;
- CTA ↔ branches ;
- automate ↔ sonde / actionneur ;
- équipement ↔ réseau.

Les relations sont des objets structurés, pas uniquement des traits dessinés.

## 17. Plans / PDF / SIG

### 17.1 Socle géométrique — VALIDÉ

Geometry :
- Point ;
- Line ;
- Polygon.

Rattachement possible à :
- Site ;
- Local ;
- Équipement ;
- Point ;
- Sujet ;
- Document / plan.

### 17.2 Outils prévus — VALIDÉ, UI AVANCÉE À CONSOLIDER

- annotation PDF ;
- texte / symboles ;
- mesures distance/surface/périmètre/angle ;
- calibration d’échelle ;
- polygones ;
- localisation d’équipements/réserves ;
- tracé réseau ;
- couches ;
- plans intérieurs ;
- fonds offline ;
- export GeoJSON/GeoPackage ;
- flux QGIS/SIG.

QGIS Desktop n’est pas embarqué dans l’application : METRA échange les données avec le monde SIG.

## 18. Reconnaissance de plaques

### 18.1 Principe — VALIDÉ, IMPLEMENTATION OCR À VENIR

Priorité :
1. photo enregistrée immédiatement ;
2. OCR local / hors ligne ;
3. interprétation locale métier ;
4. IA distante seulement en bonus.

Le traitement ne doit pas bloquer le terrain.
Si l’analyse est lente, elle s’effectue en arrière-plan.

QR code non prioritaire.

## 19. Vocal

### 19.1 Saisie vocale — VALIDÉ, OPTIONNEL

La dictée doit être un raccourci, surtout sur mobile.
Elle ne doit jamais être obligatoire.

## 20. Rapports

### 20.1 Source de vérité — VERROUILLÉ

Les objets structurés restent la vérité métier.
Le rapport est une présentation éditable de ces données.

### 20.2 Rapport dans METRA — VALIDÉ

L’utilisateur doit pouvoir :
- modifier les titres ;
- ajouter du texte rédactionnel ;
- masquer des sections ;
- réordonner les sections ;
- ajouter une section ;
- actualiser les tableaux depuis les données structurées ;
- exporter Word ;
- exporter PDF.

### 20.3 Portée — VALIDÉ

Rapports :
- global Mission ;
- site ;
- bâtiment ;
- installation ;
- autres portées selon recette.

Pour multi-site :
- rapport global ;
- rapports individuels.

### 20.4 Modèles — VALIDÉ

Plusieurs profils/modèles E&S peuvent être mémorisés.

## 21. Livrables

Selon recette :
- Word modifiable ;
- PDF ;
- Excel complet ;
- Excel synthétique ;
- inventaire ;
- tableau actions/réserves ;
- album photo ;
- plans annotés ;
- synoptiques ;
- tableaux de mesures ;
- graphiques ;
- document↔terrain ;
- programme de renouvellement ;
- budget ;
- dossier complet ;
- export SIG.

## 22. Audit énergétique / scénarios

### 22.1 Scénarios — VALIDÉ

Un scénario peut porter :
- actions incluses ;
- investissement ;
- économie annuelle ;
- économie d’énergie ;
- CO2 évité ;
- temps de retour ;
- avantages ;
- contraintes.

### 22.2 Comparaison — VALIDÉ

Existant | Scénario A | Scénario B | Scénario C | Retenu.

## 23. Études / travaux / cycle de vie

### 23.1 Continuité — VALIDÉ

Un même Dossier Mission peut évoluer :
Diagnostic → Étude → DCE → ACT/VISA → Travaux/DET → Essais → OPR → Réception/AOR → Levée → Prise en charge.

### 23.2 État projet des équipements — VALIDÉ

Exemples :
- existant conservé ;
- à déposer ;
- à transférer ;
- réemploi ;
- déposé ;
- stocké ;
- transféré ;
- réinstallé ;
- neuf ;
- mis en service.

## 24. Multi-sites

### 24.1 Workflow — VALIDÉ

PC :
- import massif ;
- préparation ;
- affectation ;
- contrôle des doublons / incohérences.

Terrain :
- navigation site par site ;
- progression ;
- saisie rapide offline.

Bureau :
- consolidation ;
- rapport global ;
- rapports individuels ;
- Excel complet.

## 25. Passation

### 25.1 Deux objets — VALIDÉ

- Audit avant prise en charge ;
- PV de prise en charge formel.

Le premier alimente le second.

### 25.2 Comparaison — VALIDÉ

Document attendu ↔ terrain constaté :
- confirmé ;
- différent ;
- non retrouvé ;
- déposé ;
- remplacé ;
- supplémentaire ;
- inaccessible ;
- à contrôler.

## 26. OPR / réception / levées

### 26.1 Une visite peut combiner — VALIDÉ

- OPR visuelle ;
- essais dynamiques ;
- levées de réserves.

Pas besoin de trois Missions distinctes.

### 26.2 Réserve — VALIDÉ

Une réserve peut viser :
- un objet ;
- une zone ;
- un groupe d’objets similaires.

Elle garde photo avant/après et historique.

## 27. Expertise / sinistre

### 27.1 Rigueur — VALIDÉ

Séparer :
- fait constaté ;
- preuve ;
- chronologie ;
- hypothèse ;
- conclusion.

Ne pas fusionner automatiquement hypothèse et fait.

## 28. Ergonomie générale

### 28.1 Préremplissage — VERROUILLÉ

METRA ne doit jamais demander une information qu’il connaît déjà.

### 28.2 Exhaustivité sans lourdeur — VERROUILLÉ

L’exhaustivité est disponible mais ne doit pas être affichée en permanence.

### 28.3 Réactivité — VERROUILLÉ

Toute fonction terrain doit privilégier le rythme de la visite.
Une fonction intelligente qui ralentit le terrain perd son intérêt.

## 29. Build / tests / non-régression

Avant intégration d’un gros lot Missions :
- syntaxe JS ;
- SQLite migration base neuve ;
- migration version précédente ;
- vérification FK ;
- séparation Intranet/Missions ;
- test import/export Excel ;
- test photos/documents offline ;
- test mission incomplète ;
- test Rapport Word/PDF ;
- build Android ;
- contrôle performance tablette.

## 30. Règles à ne jamais oublier

1. Missions ≠ Visites techniques.
2. Aucun point récurrent injecté dans Missions.
3. Missions ≠ Intranet.
4. Offline-first.
5. PC + tablette, même donnée.
6. Saisi une fois, réutilisé partout.
7. Tout structuré importable/exportable par Excel.
8. Source/provenance préservée.
9. Rapide/Standard/Expert dépend de la Mission.
10. Les relations techniques doivent être visuelles.
11. Les calculs restent explicables/modifiables.
12. Les valeurs atypiques sont « à contrôler », pas des conclusions automatiques.
13. Les originaux photo/document restent conservés.
14. Le rapport ne remplace pas les données structurées.
15. VMC/CTA Missions spécifique : différé dans le lot courant.
