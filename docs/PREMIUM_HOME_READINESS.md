# Accueil Premium - preparation avant reception des originaux

Statut : preparation technique, PAS validation visuelle, PAS APK a installer.
Branche : work/premium-home-asset-integrity. PR de travail : #81, en brouillon.
Base examinee : 74ad883a8434897587efcf7a751849b6aae2f04b.

## Perimetre et preuves

Les originaux ne sont pas disponibles. Les trois images corrompues ne sont ni
reparees permissivement, ni remplacees par des illustrations de substitution.
Le diagnostic de l'APK #9 reste documente dans
PREMIUM_HOME_ASSET_DIAGNOSIS_2026-09-12.md. Les fixtures de tests sont des formes
synthetiques temporaires : elles ne sont pas des assets livres dans l'application.

Le code relu comporte un placement contentTop >= 405 en portrait, independant de
la hauteur de la scene et du conteneur reel. L'animation demarrait au montage sans
onLoad/onError. Le controle WebP imposait aussi VP8X, alors qu'un WebP lossless avec
alpha peut etre un VP8L simple. Ces problemes sont distincts des trois fichiers
corrompus : remplacer uniquement les fichiers n'aurait pas corrige le layout.

La presente preparation conserve les quatre batiments independants, leur entree
convergente, la spirale et ses gestes actuels, les trois acces et ONLINE/OFFLINE.
Pas de panorama ancien, de titre METRA, de nom d'intervenant, de nouvelles tuiles
statistiques ou de modifications de donnees metier. Les anciens echanges Work
non accessibles ne sont pas presentes comme relus : aucun geste supplementaire
(zoom/pincement, par exemple) n'est reinvente dans cette correction.

## Changements prepares

### Moteur et lecture native des images

homeSceneModel.js contient les fonctions pures de contrat, de progression et de
layout. Les quatre identites, cotes, profondeurs, durees, canevas et intervalles
sont controles. Aucun endpoint duplique n'est transmis a Animated.

HomeBuildingScene.js conserve quatre require statiques et quatre Image distincts.
Chaque onLoad compte UNE identite; des callbacks repetes ne simulent pas quatre
images chargees. L'animation ne demarre qu'apres les quatre chargements reussis.
Une erreur ou un delai de 8 secondes sans chargement complet masque toute la scene
et remonte un etat d'erreur; pas de scene trompeuse composee d'un seul batiment.
Les images restent montees pendant le chargement pour permettre leur decodage.
Le retry remonte un composant neuf, sans toucher aux visites ou caches metier.
Les timers et animations sont nettoyes au demontage. Les preferences de reduction
des mouvements et les passages en arriere-plan sont pris en compte.
Le fondu de base a un zIndex superieur aux quatre images. La pilule decorative
blanche sceneGlow est retiree. Les commandes ne sont jamais bloquees par le decor.

### Dimensions et texte

SpiralActiveHome.js mesure son conteneur via onLayout. Scene et commandes utilisent
le meme getHomeLayout; les pixels d'une capture ne sont pas confondus avec les
unites de mise en page. Les banniere(s) de synchronisation presentes dans App.js
peuvent reduire le conteneur sans rendre le placement absolu obsolete.

La scene garde son ratio. En paysage bas, sa hauteur est bornee pour ne pas
repousser toutes les commandes sous l'ecran. Les commandes commencent devant la
base de la scene, pas apres un trou fixe de 405 unites. Elles sont dans le flux
d'un ScrollView; leur hauteur suit le texte. Une reserve de 166 unites protege
la zone tactile du dock existant. Le dock lui-meme n'est pas modifie ici.

Les categories sont en 4, 2 ou 1 colonnes selon l'espace et l'echelle de police.
Client/Derniere visite sont cote a cote lorsque leur largeur est suffisante,
sinon empiles. Les libelles n'utilisent ni ellipsis, ni reduction automatique ni
plafond de taille de police. Seuls les glyphes decoratifs ne suivent pas le zoom
texte. Les fonds de texte sont explicitement transparents et les elevations des
cartes retirees; la cause exacte des rectangles internes de la capture reste a
verifier sur Android (ne pas attribuer ce point aux images corrompues).

Les callbacks de navigation/import/creation et la logique de getActivationStatus
sont conserves. ONLINE reste le sens Intranet actuel; ce chantier ne transforme
pas ce statut en sonde de connectivite physique.

### Reception des quatre images

prepare_premium_home_images.py accepte quatre PNG ou WebP statiques avec
transparence reelle. Il effectue un decodage complet, rejette les doublons et
verifie que chaque batiment contribue encore a la composition finale.
Les originaux doivent partager un meme canevas d'export. S'ils sont chacun
recadres, le script refuse de deviner leurs positions : il faudra definir leur
placement commun apres examen des images. Il ne les etire pas independamment.

Les originaux sont preserves. Une seule reduction d'echelle commune est appliquee
si necessaire (largeur maximale 1024 par defaut, pas d'agrandissement). Le ratio
commun determine la hauteur; le manifeste doit reprendre le canvas du rapport.
Les sorties sont en WebP lossless, redecodees et comparees pixel par pixel a la
version normalisee. Elles sont placees dans un NOUVEAU dossier temporaire de
preparation, jamais ecrasees directement dans le depot.

Commande, a executer UNIQUEMENT apres reception des originaux :

    python .github/scripts/prepare_premium_home_images.py \
      --haussmann /chemin/copro.png \
      --collectif /chemin/bailleur.png \
      --poste-municipal /chemin/collectivite.png \
      --building /chemin/tertiaire.png \
      --output /chemin/nouveau-dossier-de-preparation

Sorties : les quatre fichiers aux noms deja attendus par Metro, un rapport
asset-provenance.json et une composition de controle hors application.
La provenance relie SHA256 de l'original, du WebP et des pixels decodes.
Aucune conversion ne peut restaurer les trois bitstreams actuellement corrompus.

### Barriere de livraison Preview

Le workflow Preview prepare sur CETTE BRANCHE exige, avant Gradle : les tests, le
contrat de structure, le decodage integral et la concordance avec la provenance.
Apres Gradle, il inspecte les WebP a l'interieur du veritable APK et retrouve les
quatre fichiers par SHA256, independamment du nom choisi par Android.
Une image manquante/modifiee bloque l'upload et la publication.

Les artefacts ont des noms distincts pour chaque tentative. La release est creee
en brouillon; le workflow retelecharge son APK, compare son SHA256, puis seulement
publie la pre-release et son lien. Une preuve d'integrite n'est pas une preuve de
bonne apparence : la validation visuelle Android reste explicitement requise.
Ce flux de livraison n'a pas encore ete execute avec des originaux sains.

Le workflow leger separe tests du code (doivent passer) et images de production
(doivent rester bloquees tant que les originaux/provenance manquent).
La branche native-android et son workflow de release complet ne sont pas modifies.
Lors de la migration finale, les memes controles pixels/provenance/APK devront
etre raccordes a native-android-apk.yml avant toute publication native complete.
Ne pas presenter cette derniere integration comme deja faite.

## Verification executee localement

    node --test .github/scripts/test_premium_home_model.js
    python .github/scripts/test_premium_home_images.py -v

15 tests de modele/contrat, dont une matrice de 240 combinaisons dimensions/police.
19 tests images/intake/packaging, avec fixtures temporaires : fichiers valides,
tronques, vides, opaques, dupliques, occultes; VP8L valide; originaux PNG/WebP;
preservation des sources; refus d'ecrasement; canevas incompatibles; provenance
absente/falsifiee; ZIP de type APK avec ressource manquante; passage de bout en bout
du staging PNG aux controles combines de structure/pixels/provenance.

Le JSX a ete parse localement avec le parseur TypeScript disponible. Le workflow
leger parse aussi les fichiers avec @babel/parser provenant du lockfile, sans
executer postinstall pendant cette etape. Pas de compilation/emulation Android
locale, pas de test React Native sur appareil et pas de mesure de FPS a ce stade.
Les tests geometriques ne mesurent pas le rendu reel des polices Android.

## Ordre de cloture obligatoire a reception

1. Conserver et identifier les originaux; examiner alpha, cadrage, qualite, canevas.
2. Preparer les quatre calques en une passe, verifier la composition et chaque
   calque isole. Reporter le canevas reel dans manifest.json.
3. Transferer les fichiers sans reconstruction manuelle du binaire; comparer les
   SHA256 locaux a ceux des octets recuperes depuis le commit GitHub.
4. Ajouter la provenance. Faire passer tests, conteneurs, pixels et contribution
   de chaque calque. Verifier entree/deplacement avec ces images, pas des fixtures.
5. Integrer la preparation sur ui-preview en un seul lot coherent. Construire un
   seul APK; verifier les quatre ressources effectivement embarquees et son hash.
6. Verifier Android portrait ET paysage, petite largeur, police standard et
   agrandie, changement d'orientation, aller-retour accueil, reprise depuis
   arriere-plan, reduction des animations, aucune visite et une visite presente.
7. Verifier aussi le raccord de position/taille entre intro spirale et dock.
   Verifier les 4 silhouettes finales, l'ordre/depth, le mouvement, l'absence de
   rectangle bleu ou de coupure de libelle, le scroll, la spirale et chaque acces.
8. Valider la copie effectivement telechargee. Ensuite seulement envisager le
   branchement des gates et la fusion dans native-android.

Aucune des validations visuelles dependantes des images n'est cochee par avance.
Aucun nettoyage des donnees utilisateur, aucune desinstallation de l'app terrain,
aucune fusion ou recompilation native n'est necessaire pendant cette attente.
