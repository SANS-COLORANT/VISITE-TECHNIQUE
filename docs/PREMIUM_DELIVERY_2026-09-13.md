# Livraison Premium - originaux et velours

## Etat et separation des environnements
Les medias originaux sont disponibles dans la conversation, mais pas encore dans GitHub.
Le connecteur de cette session ne sait pas televerser un binaire local. Aucun APK complet
avec ces medias n'est donc annonce comme produit avant leur import effectif.
La branche de travail reste `work/premium-home-asset-integrity`; aucune fusion ni modification
de `native-android`. La PR #81 reste en brouillon pour la recette visuelle sur Android.

## Unique fichier a deposer
Deposer **METRA_ASSETS_VALIDES.zip**, sans le decompresser, a la racine de la branche de travail.
Taille : 14035379 octets.
SHA256 : `221005ace05749a9a149941aa0352cde3fb58418bcdb445174f27ce79bb3374c`.
Cette archive remplace l'ancien lot de preparation. L'approbation machine est dans
`.github/premium-assets-approved.json`; les originaux de la conversation restent inchanges.

Le workflow `Import verified premium media and build APK` est declenche par ce seul depot :
1. Verification de l'archive, des dix membres et de leurs empreintes.
2. Decodage integral des quatre calques et de toutes les 147 images de l'animation.
3. Commit des seuls medias, provenance et manifeste; retrait du ZIP du repertoire courant.
4. Appel explicite du workflow Preview sur le commit importe (pas de dependance a un push de bot).
5. Compilation APK avec identifiant `com.visitetechnique.tablet.preview`, nom `Visite Preview`.
6. Controle des images et des ressources natives reellement embarquees dans l'APK.
7. Release en brouillon, retelechargement et comparaison SHA256, puis publication en preversion.
L'application terrain n'est pas remplacee. Le ZIP depose reste dans l'historique Git.

## Images et scene
Les quatre PNG 4096x2160 sont reduits ensemble a 2048x1080 puis encodes en WebP sans perte.
Les pixels redecodes sont compares aux pixels attendus; le canevas et les positions d'origine
restent communs. Quatre fichiers independants : aucune photographie panoramique de substitution.
Le chargement attend les quatre confirmations distinctes; un echec masque toute la scene et
propose un reessai, sans bloquer les fonctions metier.

## Animation V4 et dock
Le fichier WebP original est utilise sans recompression (12489004 octets, 147 images, 4900 ms).
Le lecteur Android `ImageDecoder` / `AnimatedImageDrawable` lit les assets locaux, une seule fois,
et signale la fin reelle a React. L'ancien delai de 2500 ms ne coupe plus cette intro.
L'animation de cadrage se fait cote natif; un delai de securite de 13 secondes est uniquement
une sortie d'erreur, pas un faux signal de lecture terminee.
Android 9 / API 28 ou plus est necessaire pour cette lecture animee. Sur un Android plus ancien,
le decor et le dock PNG restent utilisables et l'introduction animee est sautee. La reduction
des mouvements et les interruptions en arriere-plan disposent aussi d'une sortie sure.

La derniere image source est partiellement coupee en bas. Un dock pouvant tourner ne peut pas
etre reconstitue honnetement depuis ce seul fragment : le PNG du dock est extrait de l'image
complete 75 du MEME WebP, rectangle [860,390,1164,694]. Une transition explicite de 180 ms fait
le raccord. Il ne s'agit pas d'une reconstruction inventee ni d'une garantie de raccord pixel
par pixel. Les gestes existants du dock sont conserves.

## Tests et limites de validation
Les tests locaux du modele et des contrats d'integration sont distincts des tests d'images;
les journaux GitHub font foi pour la compilation Kotlin. Le preflight natif peut compiler
les sources sans medias, mais NE produit NI APK NI release. Le build de livraison interdit
ce mode et exige les vrais fichiers approuves avant de compiler et publier.

Restent necessaires apres la premiere livraison : essai reel Android portrait/paysage,
texte agrandi, quatre silhouettes distinctes, animation et raccord du dock, chargement hors
connexion, erreur de chargement, arriere-plan/reprise, navigation et rotation de la spirale.
Un build vert ne constitue pas a lui seul une validation visuelle de la tablette.
