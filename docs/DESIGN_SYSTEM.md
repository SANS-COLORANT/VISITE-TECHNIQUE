# Direction artistique METRA — « Verre chaud »

Direction validée par le porteur du projet le 25/09/2026, parmi trois propositions
(maquette de référence : https://claude.ai/artifact/EpbszY8T1AoUnTJvXG7XLT, colonne B ;
détail de l'écran Visite : https://claude.ai/artifact/TZpDuD3AKdnqPwR6J1WowT).
Toute l'application suit cette DA. Un nouvel écran ou une retouche qui s'en écarte doit
être justifié et validé avant d'être livré.

## Principes

1. **Fond crème chaud + halos** : fond `COLORS.bg` (#F3F1EC) sur lequel
   `AmbientBackground` (racine de `App.js`) pose deux halos de l'accent en dégradé
   radial. Les écrans de navigation laissent leur racine transparente pour que le fond
   ambiant soit visible ; ne pas leur remettre un `backgroundColor` opaque.
2. **Surfaces en verre** : cartes translucides (`rgba(255,255,255,0.8)`), bordure fine
   `rgba(22,21,15,0.1)`, ombre à deux niveaux. Le vrai flou natif (`GlassCard`,
   `@react-native-community/blur`) est réservé aux éléments phares (carte « Reprendre »,
   jauge de visite), pas aux listes, pour préserver la fluidité du défilement.
   `expo-blur` est proscrit : il ne floute jamais sur Android.
3. **Accent en dégradé** : actions principales, onglet actif et repère de marque en
   dégradé `orange → orangeDark` avec halo d'ombre de la même couleur.
4. **Icônes, pas de texte ni d'emoji** : pictogrammes SVG `CvcIcon`
   (`MetraCvcIcons.js`), posés dans `IconOrb` (fond duoton + anneau d'accent) quand ils
   représentent un objet ou une action. Aucun emoji ni glyphe Unicode comme icône.
5. **Typographie** : Sora pour les titres et les chiffres, Inter pour le texte
   (`AppFonts.js`, constantes `FONTS` dans `styles.js`). Tout nouveau style de texte
   partagé porte un `fontFamily`.
6. **Jauge circulaire** : une progression se montre avec `ProgressRing`, pas avec une
   barre ni un pourcentage seul.

## Structure de navigation

- Barre de navigation du bas `BottomTabBar` (Accueil, Clients, bouton central +,
  Missions si activé, Réglages), dans le flux et non en surimpression. Le + ouvre
  `QuickVisitSheet` : visite rapide sans client, rangée sous le client local
  technique « À rattacher » (`quickVisitDb.js`), jamais proposée à l'envoi Intranet.
  `AttachVisitSheet` la rattache ensuite à un vrai client (site existant ou nouveau
  site), depuis l'accueil ou la pastille « À rattacher » de l'écran Visite. Masquée sur les écrans de saisie
  plein écran (Visite, Rapport, LAB 3D, Schéma).
- En-têtes : fond transparent, bouton retour en verre (`simpleHeaderBack`), grand titre
  aligné à gauche (`simpleHeaderTitle`).

## Écran Visite (ICPE, VMC, Pré-allumage)

Coque commune (`VisitChrome.js`) :
- en-tête : retour en verre, nom du site, sous-titre client · trame, exports à droite ;
- carte jauge : avancement, compteurs S · N.S · S.O (`visitTabStatusDb.js`), état de
  sauvegarde, synchronisation Intranet (ou pastille « À rattacher ») ;
- `SectionRail` (téléphone) / `SideSectionList` (tablette) : chaque onglet porte son
  état (vide, entamé, terminé, anomalie) ;
- `VisitActionBar` en bas, dans le flux : Note, Photos, Anomalie.

Contrôles : libellé sur sa ligne, puis les 5 avis (S, N.S, N.R, S.O, N.V) en
segments pleine largeur (`styles.controlTop` / `avisChip`). Aucun contrôle, avis ni
observation prédéfinie n'est retiré : la refonte ne touche que la présentation.
VMC : cartes de caissons avec avancement et N.S (`VmcCaissonManager`).
Pré-allumage : locaux en pastilles avec état, barre d'avancement et N.S ; rubriques en
cartes de verre avec pastille d'état et compteur. Mesures : `StepperNumerique`
(grand chiffre, boutons −/+ de 52 px).

## Éléments communs (styles.js)

- Boutons : `btnPrimary` pilule orange lumineuse (rayon 17, 50 px mini, halo) avec
  `<ButtonGlow />` en premier enfant pour le dégradé (`tone="mission"` en vert),
  `btnSecondary` pilule de verre. Missions : même forme, accent vert.
- Fenêtres : `modalOverlay` voile fumé chaud, `modalSheet` feuille flottante qui
  monte du bas (rayon 28, 92 % de hauteur maxi).
- Champs : `input` 48 px, rayon 14, fond blanc.
- Icônes : toujours `CvcIcon` (dessinées), jamais de caractère texte (✕ ⧉ ✎ › ⋯).
  Icônes disponibles aussi : close, copy, more, chevron-up/down, refresh, fan, flame.
- Typographie : toujours `FONTS` (Sora pour les titres, Inter pour le texte),
  jamais `fontWeight` seul (qui retombe sur la police système).
- Surfaces : blanc translucide (`rgba(255,255,255,0.8)`) pour laisser voir les
  halos ; racines d'écran transparentes, y compris Missions et modes téléphone.
- **Android : jamais d'`elevation` sur un fond translucide** (l'ombre se voit à
  travers : cadre gris dans la carte). Une surface avec ombre est en blanc chaud
  opaque `#FDFCFA` ; une surface translucide n'a pas d'elevation.
- Barres système : barre d'état transparente (le fond va jusqu'en haut), barre de
  navigation couleur du fond (`app.json`).
- En-têtes : `HeaderFade` sous l'en-tête pour fondre le contenu qui défile.
- Une seule action principale (bouton dégradé) par écran ; les autres en verre
  avec icône orange.
- Champs d'une même section groupés dans une carte unique (`fieldGroup*`).

## Comportements (retours, chargements, alertes)

- **Alertes** : `Alert.alert` est remplacé au démarrage par une feuille maison
  (`PremiumDialogs.js`, `installPremiumAlert`) ; aucun écran n'appelle l'alerte
  système directement. Action principale en dégradé, destructive en rouge.
- **Retours terrain** : `feedback(message)` (`fieldFeedback.js`) = toast bref +
  vibration légère ; `hapticTick()` sur chaque choix d'avis.
- **Chargements** : silhouettes `SkeletonList` / `SkeletonVisit` (`Skeleton.js`),
  pas de roue seule.
- **États vides** : `EmptyIcon` en tête de `styles.empty`.
- **Listes longues** : `FastList` (FlashList en une colonne).
- **Photos** : `PhotoVariantImage` via expo-image (cache + fondu).
- **Visite** : « Tout en S » par section (annulable), « Suivant : onglet » en
  bas de chaque onglet, recherche dans la visite, vérification avant export.
- **CI** : `premium_style_pass.py` applique ces règles au code injecté par les
  patches ; le job `ui-screenshots` capture l'interface sur émulateur.

## Thèmes

### Parcours terrain issu de la maquette du 06/10/2026

Le sommaire de la visite a été retiré le 9 octobre 2026 (il ralentissait la saisie) :
la visite s'ouvre directement sur les onglets de la trame, dont les clés de
stockage sont inchangées.

Le balayage horizontal entre onglets est court et vif : il démarre dès que le
geste est un peu plus horizontal que vertical, la page suit le doigt (les pages
voisines s'estompent légèrement), un geste d'environ 3,5 % de la largeur ou un
petit coup de doigt suffit, et la fin du geste est un ressort critique sans
rebond qui reprend la vitesse du doigt (`swipeNavigation.js`, pilote natif).
Le pointage des équipements est explicite et propre à la visite : il ne reprend
pas une confirmation historique et n'invente pas d'état. Les fiches détaillées
et l'ajout rapide sont présentés en feuilles, avec historique et photos.
La lecture de plaque passe par l'appareil photo Android ou une image locale,
puis une vérification éditable avant application. Les relevés utilisent le
même mécanisme de confirmation OCR. Aucun résultat ou degré de confiance
n'est affiché comme certain sans résultat réel du moteur local.
Les points de mesure complémentaires restent propres à leur visite et sont
restitués dans l'annexe Excel `MESURES_COMPLEMENTAIRES`, sans modifier les
lignes standard des modèles ni inventer de critères Intranet.
Les réserves précédentes restent consultables en lecture seule ; « Levée sur
place » met à jour l'avancement de la réserve courante, sans changer l'avis
ni effacer le constat. VMC et Pré-allumage gardent leurs panneaux spécialisés.

- Visite Technique : accent orange `#F26426` / `#D9531A`.
- Missions : même DA, accent vert `MISSION_COLORS.accent` / `accentDark`.

## Composants de référence

| Besoin | Composant / style |
|---|---|
| Fond d'écran | `AmbientBackground` (`premiumChrome.js`) |
| Carte phare avec flou | `GlassCard` |
| Icône d'objet ou d'action | `IconOrb` + `CvcIcon` |
| Progression | `ProgressRing` |
| Apparition à l'écran | `FadeUp` |
| Navigation principale | `BottomTabBar` |
| Coque de visite | `SectionRail`, `VisitActionBar`, `AvisCounters` (`VisitChrome.js`) |
| Carte de liste / formulaire | `styles.card`, `styles.formCard` |

## Modes téléphone

- Le téléphone démarre directement sur la version complète (plus d'écran de
  choix de mode).
- **Mode Photo** : s'ouvre pendant la visite, bouton central « Mode Photo »
  de la barre d'actions (téléphone et tablette). Écran principal « Ajout
  rapide » : + Compteur (type en 1 appui → photo de l'index lue par OCR),
  Températures (saisie en ligne, « Suivant » enchaîne), + Équipement (photo
  de plaque → fiche pré-remplie), Remarque (photo + dictée), Photo libre ;
  puis « Tout parcourir » par module. En quittant, la visite est rechargée.
- **Compagnon** : icône téléphone en haut de l'accueil.

## Outils terrain (lot « 14 améliorations »)

- Mode Photo : valeur lue (OCR) ou dictée toujours **confirmée** dans une
  barre (valeur modifiable, visite précédente et écart ; index qui baisse en
  orange). « Relever à la suite » enchaîne photo → validation → suivant.
  « Dicter » : « gaz 12 458 », « départ chauffage 72 virgule 5 ». « Rafale » :
  photos à la chaîne puis tri (rattacher à un élément).
- Visite : reprise annoncée (« Reprise à l'onglet … »), « Enregistré il y a … »,
  onglets en bas en option (Réglages), bouton de fin (aperçu du rapport,
  signature client, export Excel).
- N.S : la réserve déjà rédigée pour ce contrôle (même site en priorité) est
  proposée en un appui.
- Réglages › Affichage terrain : Plein soleil (contraste, redémarrage),
  Onglets en bas. Sauvegardes : copie quotidienne de la base dans un dossier
  du téléphone (7 conservées).
- Accueil : « Reste : 2 N.S sans photo · 1 index à relever · à faire signer »
  sous les visites en cours.
- Préférences d'interface : uiPrefs.js (SQLite séparée, lecture synchrone).
- Signature : _meta `signature_visite_<id>`, rendue en fin de rapport PDF.

## Retours terrain tablette (post-it)

- Listes de saisie : `removeClippedSubviews={false}` (sinon le clavier se
  ferme quand la liste rétrécit à son ouverture).
- Glissé entre onglets : 7 % de la largeur ou geste rapide, angle tolérant.
- Catégories de conformité repliables (chevron) ; « Tout en S » : appui long
  pour S.O / N.S / N.R / N.V, toujours annulable.
- Catégories de 12 contrôles et plus découpées à l'écran par préfixe
  (« Extincteurs », « Désenfumage »…) ; trame, base et rapports inchangés.
- Relevés : pictogrammes et noms courts (index, pressions, températures par
  circuit et sens), nom complet toujours modifiable.
- Réserve ICPE : criticité réglable (curseur 0–5).

Le parcours terrain commun s’applique à toutes les trames hors Pré-allumage. En VMC, les espaces suivent les caissons et les groupes Situation, Caisson, Distribution et Gestion, avec les mêmes cartes de progression, recherche, fiches et actions. Les codes de stockage et contrôles propres à la VMC restent ceux de sa définition. Pré-allumage conserve sa navigation spécialisée par bâtiments et locaux.

Les échanges antérieurs METRA rappellent les régressions à éviter : patrimoine rattaché au local et à sa trame, réimport sans doublons ni remplacement destructeur des parents SQLite, identités locales distinctes des identités Intranet, photos limitées à leur périmètre, séparation RCU Primaire/Secondaire sans imposer ce choix aux autres trames, migrations additives et validation du release signé/uploadé. Ces règles restent indépendantes de la présentation ; un index historique, un état importé ou une ancienne anomalie ne constitue pas un nouveau constat terrain.

## Refonte des onglets de visite (build 661 → refonte, 10/2026)

Conçue écran par écran avec le porteur du projet ; dossier complet, maquettes
et captures : `docs/refonte-visite-661/`. Règles désormais communes à tous les
onglets de visite :

- **Rubrique = carte à bannière** (`SectionCard` / `SectionBanner`, `VisitKit.js`) :
  pictogramme sur pastille, titre, avancement « x/y », badge « n N.S »,
  action éventuelle (« Tout en S », « Idem chauffage », « + Ajouter »).
  Toucher le titre replie / déplie. **Tout est fermé à l'ouverture**
  (`useSectionsOuvertes`), sauf ce qu'un filtre actif doit montrer.
- **Paramètre à choix** (`ChoiceField`) : il se referme sur la valeur choisie
  (pastille orange, bleu-vert pour l'eau) ; on le rouvre d'un toucher pour
  retirer ou changer ; choix multiples validés par « OK » ; « + Autre »
  conservé ; 2–3 choix courts en interrupteur à segments.
- **Valeurs numériques en tuiles** (`ValueTile`) : − / + autour d'un chiffre
  lisible, deux tuiles côte à côte quand elles vont ensemble ; le premier
  appui part d'une valeur utile, jamais de 0.
- **Noms et unités modifiables** (`InlineRename`, `UnitPill`) : noms
  d'affichage seulement, la ligne du rapport et les clés ne changent pas.
- **Édition dans une feuille du bas** (`BottomSheet`), menu « ⋯ »
  (`ActionMenu`) pour les actions rares ; toute suppression est confirmée,
  les actions groupées proposent « Annuler ».
- **Pictogrammes** : jeu dédié de 151 dessins (`MetraPictos.js`, données
  générées dans `MetraPictos.data.js` depuis `docs/refonte-visite-661/pictos/`
  par `outils/generer_pictos_rn.py`) : encre pour la forme, accent orange pour
  l'élément qui parle, **bleu-vert `#0F7C8C` pour l'eau** (seule exception à
  l'accent orange, réservée à l'ECS, l'eau froide et l'adoucisseur). Un
  pictogramme par onglet, rubrique, type de compteur, d'équipement, état,
  criticité et origine de photo ; correspondances par libellé
  (`pictoOnglet`, `pictoSection`, `pictoCompteur`…). `CvcIcon` reste utilisé
  pour les icônes d'interface (chevrons, fermer, plus, note…).


## Barre d'onglets de la visite : bulle liquide

La bulle orange de l'onglet actif suit le doigt sans retard : elle se vide de l'onglet quitté et remplit l'onglet visé du côté d'où vient le geste, le texte blanc restant fixe sous le liquide. Le bord est une vague qui ondule au maximum à mi-remplissage et se calme quand la bulle est pleine ou vide.

Réalisation 100 % native : la bulle est découpée en bandes horizontales (`WAVE_ROWS`), chaque bande est décalée par une interpolation de la valeur animée du pager (`bordBande`, `profilBande`, `swipeNavigation.js`). Aucun calcul JavaScript pendant le geste, donc aucun retard, même quand le thread JavaScript est occupé à monter la page voisine. Seules la bulle active et ses voisines portent le liquide. Un premier essai redessinait le bord depuis JavaScript (SVG) : il prenait du retard et l'ondulation ne s'affichait pas ; il a été abandonné.

La barre défile aussi avec le geste : sa position suit celle du pager (`decalageBarre`, `centrerOnglet`), de sorte que l'onglet visé est déjà en vue, centré, quand la page arrive. Le défilement manuel de la barre reste libre hors geste.
