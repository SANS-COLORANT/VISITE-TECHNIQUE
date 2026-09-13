# Prochain aperçu : quatre calques d'arbres indépendants

## État de cette préparation — 13 septembre 2026

L'utilisateur a fourni Arbre 1.png, Arbre 2.png, Arbre 3.png, Arbre 4.png et leurs quatre versions WebP. Les huit originaux ont été intégralement décodés : canevas commun 1080 × 2048 RGBA, transparence réelle.

Les nouveaux médias sont préparés dans la conversation, PAS encore téléversés dans GitHub. Ce commit publie la procédure d'import, les règles du prochain build et un patch lisible de la scène. Il ne remplace pas les médias actifs et ne lance pas d'APK. La branche native-android et le dernier APK fonctionnel restent inchangés.

## Ordre de composition retenu

Ciel natif → quatre bâtiments V2 indépendants → végétation → voile de lisibilité → commandes et spirale.

| Source maître | Identité | Fichier app | Profondeur |
| --- | --- | --- | ---: |
| Arbre 4.png | trees-rear | 05_trees_rear.webp | 5 |
| Arbre 3.png | trees-left | 06_trees_left.webp | 6 |
| Arbre 2.png | trees-right | 07_trees_right.webp | 7 |
| Arbre 1.png | trees-front | 08_trees_front.webp | 8 |

« rear » désigne le fond du groupe végétal : ce calque reste devant les bâtiments. Les positions communes des PNG sont conservées. Aucun recadrage individuel, redimensionnement, fond noir ajouté ou fusion des arbres en une seule image. Les dérivés WebP sont sans perte, avec égalité exacte des pixels RGBA après réouverture.

Les quatre dérivés d'arbres pèsent ensemble 5 595 824 octets. Leur mémoire décodée et la fluidité devront être vérifiées sur Android ; le poids disque ne constitue pas une mesure mémoire/FPS.

Les arbres conservent le fondu d'entrée prévu. Aucun vent permanent, nuage animé ou nouveau geste n'est ajouté dans cette révision. Le film velours original, le lecteur et la texture du dock ne changent pas.

## Intégration préparée et testée

La scène attend HUIT chargements distincts : quatre bâtiments et quatre arbres. Sept chargements, les doublons, un ancien identifiant trees ou une erreur suivie d'un callback tardif ne peuvent pas révéler une scène incomplète. Les huit canevas partagent une transformation proportionnelle. Les calques restent non interactifs et le dock reste au-dessus du contenu défilant.

Le ZIP contient également l'intégration ciel/bâtiments V2 qui n'avait pas encore été déposée. Il remplace entièrement METRA_DECOR_V2.zip ; il ne faut pas installer les deux lots successivement.

`.github/premium-trees-v3.patch` est un aperçu du diff des trois composants/modèles par rapport à b68d086. Ne PAS l'appliquer seul : le manifeste, les validateurs, les tests et les médias associés sont nécessaires. L'importeur applique l'ensemble contrôlé depuis le ZIP après les vérifications.

## Contrôles effectués localement

- 39 tests JavaScript + 36 tests Python réussis (75 au total), dont les tests historiques et 19 nouveaux tests V3.
- Tous les pixels des quatre nouveaux PNG, de leurs WebP fournis et des dérivés app décodés.
- Huit calques de production distincts vérifiés ; contrôles du canal alpha, des empreintes et de la contribution visible après superposition.
- Contributions alpha des bâtiments après végétation : 49,31 %, 61,08 %, 47,34 %, 75,27 %. Cela ne mesure pas la lisibilité derrière les boutons.
- Vérification inchangée des 147 images velours et du dock : réussie.
- Import complet du nouveau ZIP sur une copie de la base : réussi ; fichiers importés comparés octet par octet à la préparation ; npm run verify:metra réussi.
- ZIP altéré rejeté. Ancien ZIP V2 rejeté. Source modifiée après préparation rejetée sans écrasement.
- Lecture YAML des deux workflows réussie.

Aucun résultat de compilation ou de test visuel Android V3 n'est annoncé. Les tests d'empaquetage utilisent des ZIP synthétiques, pas un nouvel APK.

## Dépôt à effectuer lorsque disponible

Déposer METRA_DECOR_V3.zip inchangé à la racine de work/premium-home-sky-trees, puis valider le commit.

- Taille : 6 085 655 octets.
- SHA256 : 58852e138b2ec7fe052199c35e74b48f7c4a8a8dc3e7c73d41d2e121aad16a5f.
- 24 fichiers de contenu contrôlés + BUNDLE_MANIFEST.json.

Le workflow Import scenery V3 and build APK vérifie le ZIP et les empreintes des fichiers de départ, exécute les tests dans une copie, puis commit tous les médias et le code ensemble. Il appelle ensuite Garden V3 Preview APK sur le commit exact importé. Le prochain APK doit contrôler les huit images embarquées et le téléchargement de la préversion avant publication.

L'ancien METRA_DECOR_V2.zip est explicitement refusé. Aucun effacement des données de terrain ni réinstallation de l'application principale n'est requis.

## Recette restant nécessaire

Après compilation : portrait/paysage, contraste sur feuillage, taille de texte, contours, rapprochement des bâtiments, erreurs de chargement, navigation locale, gestes de la spirale, raccord de l'introduction et consommation mémoire. La composition des calques est vérifiée localement, pas encore à l'écran sur Android.
