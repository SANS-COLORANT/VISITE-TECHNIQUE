# OCR hors connexion : lecture par segments des afficheurs LCD

**Statut : aide à la lecture, pas une lecture parfaite.** Sur des photos jamais vues pendant le réglage, le lecteur retrouve environ 4 chiffres sur 10 ; sur les photos de réglage, 9 sur 10. L'index n'est donc reporté dans le champ que lorsque rien n'est douteux ; sinon il s'affiche comme indication et l'utilisateur le saisit.

## Pourquoi ML Kit échoue sur ces compteurs

Diagnostic fait sur 32 photos de compteurs réels (Kamstrup MULTICAL 21/601/602, Actaris CF 800, Itron CF Echo II, compteurs d'eau flowIQ, Zenner et à rouleaux).

- ML Kit lit du texte de scène. Sur un afficheur LCD à sept segments, il confond les segments allumés et les segments éteints en filigrane : 0/8, 4/9, 1/7. Exemple de la PR 101 : `2358 159` lu pour `23501,54`.
- Il perd la virgule, qui est un petit trait au bas du chiffre.
- En revanche, les boîtes de ligne qu'il renvoie localisent correctement la ligne de chiffres, même quand ses chiffres sont faux.
- Le parseur ne peut pas reconstruire une information que le moteur n'a pas lue : les correctifs précédents (texte vide, faux index, unité lue comme « 1 ») traitaient des symptômes.

## Ce qui a été ajouté

| Pièce | Rôle |
| --- | --- |
| `SevenSegmentReader.java` | Lecteur en Java pur, sans Android. Prend une boîte approximative de la ligne de chiffres, l'affine (inclinaison, bande, colonnes), décide chaque chiffre en comparant les sept segments aux dix motifs, détecte la virgule comme un petit point au bas de la ligne et donne pour chaque chiffre une marge de confiance et ses alternatives. |
| `MeterSegmentReader.java` | Lien Android : récupère les lignes de la passe pleine photo de ML Kit (les plus hautes d'abord), découpe autour de chacune et appelle le lecteur. |
| `MetraOcrModule.kt` | Ajoute `segments` à la réponse, après les passes de texte et dans un `try` : une erreur du lecteur ne peut pas faire perdre les lectures de texte. |
| `photoModeData.js` | `extraireIndexSegments` et `resumeIncertitudesSegments`. La lecture par texte garde la priorité ; les segments ne servent que si le texte n'a rien de sûr. |
| `PhotoOcrReview.js` | Message d'aide : chiffres à confirmer et position de la virgule. |

Règles de sécurité :
- Le lecteur n'utilise ni relevé précédent, ni numéro de série, ni identité du compteur.
- **Pré-remplissage uniquement si rien n'est douteux** : tous les chiffres décidés avec marge, virgule réellement vue, nombre de chiffres égal à celui de la ligne ML Kit. Sinon `value` reste vide et la lecture est affichée comme proposition non reportée.
- Une ligne dont le nombre de chiffres diffère de plus d'un de celui de ML Kit ne propose rien.
- L'unité vient du texte de la photo quand il existe (une unité incompatible bloque toujours l'application). Sinon l'unité du champ est utilisée et le message le dit.

## Résultats mesurés

Jeu de test : photos du client fournies par l'utilisateur. Elles ne sont pas dans le dépôt et seuls les résultats agrégés sont publiés. Index attendus lus à l'œil, ou issus des relevés saisis dans l'application.

| Jeu | Protocole | Chiffres exacts | Index complets exacts |
| --- | --- | --- | --- |
| Synthétique (versionné) | 12 nombres × 3 variantes (taille, inclinaison, bruit, segments éteints visibles), bande décalée de 10 % | 100 % | 36/36, virgule 27/27 |
| 8 photos de réglage | photo entière + boîte de ligne (serrée, large, avec l'unité) | 116/129 (90 %) | 17/24 |
| 8 photos de réglage | recadrage + boîte décalée de ±10-15 % | 247/344 (72 %) | 29/64 |
| **5 photos de validation, jamais utilisées pour régler** | photo entière + boîte de ligne | **41/99 (41 %)** | **2/15** |
| **5 photos de validation** | recadrage + boîte décalée | **127/264 (48 %)** | **10/40** |

Calibrage de la marge de confiance (photos de réglage, lectures dont le nombre de chiffres est correct) : 93 % des chiffres sont justes (222/238). Avec le seuil retenu (marge < 1,0), 122 chiffres sur 238 sont signalés et aucun chiffre faux ne passe inaperçu ; avec 0,8, 71 sont signalés et aucun faux non plus. Sur les photos de validation, un chiffre faux sur 99 n'était pas signalé (4 l'étaient) : le signalement n'est pas une garantie.

Ce que montre la validation :
- Les afficheurs nets sont bien lus : au niveau recadrage, une photo de validation est lue à 100 % ; sur la photo entière, le dernier « 1 » très fin est parfois perdu. Une autre photo est lue à un chiffre près (un 9 pris pour un 4).
- Les afficheurs sombres ou peu contrastés (deux photos sur cinq) échouent.
- Les erreurs viennent surtout de la structure (chiffre en trop ou manquant aux extrémités), pas seulement des chiffres confondus.
- L'échantillon est petit (13 photos, un seul site). Les pourcentages sont des ordres de grandeur, pas des garanties.

## Retour de test sur tablette (APK 667)

Trois photos testées : deux sont restées vides (voulu : lecture incertaine ou pas d'ancre), la troisième a été remplie avec `9555` au lieu de `955,67`. Cause : pas le lecteur par segments, mais le parseur de texte historique. ML Kit répète la même erreur sur plusieurs passes (`9555 wh`) et ces passes se « confirment » entre elles.

Corrections (`extraireIndexCompteur`) :
- Un index MWh/kWh **sans virgule** lu uniquement par le texte n'est plus jamais reporté dans le champ (les compteurs d'énergie affichent des décimales) ; il reste une indication.
- Si le texte et les segments donnent exactement les mêmes chiffres, la lecture est **corroborée** : la virgule vue par les segments est utilisée et le champ est rempli.
- Si les deux divergent, rien n'est rempli et les deux lectures sont affichées.

Limite constatée : sur la photo du MULTICAL 21, ML Kit ne lit jamais les gros chiffres (il ne sort que les décimales `519`). Le lecteur par segments part des lignes de ML Kit et n'a alors rien à lire. Il faut un localisateur d'afficheur indépendant ou un cadrage guidé.

## Ce qui n'est pas validé

- **Rien n'a été compilé ni exécuté sur Android** : `MeterSegmentReader.java` et le bloc ajouté à `MetraOcrModule.kt` n'ont pas pu être compilés ici (pas de SDK Android). ML Kit n'a pas été exécuté non plus : les boîtes de ligne ont été simulées à partir de la position réelle des chiffres, avec du bruit. Le comportement réel dépend de la qualité des boîtes de ML Kit.
- Le décodeur n'est pas testé sur la tablette. Le temps de calcul n'est pas mesuré sur l'appareil (environ 160 évaluations de bande par ligne, trois lignes au plus).
- Les compteurs à rouleaux (chiffres noirs, décimales rouges) ne sont pas gérés par ce lecteur. Les afficheurs inclinés fortement (photo en biais) non plus.
- Le test `test_meter_destinations.js` ne tourne pas dans cet environnement (`xlsx` absent) ; il échoue de la même façon sans ces modifications.

## Rejouer

```powershell
npm run verify:seven-segment                      # compile et exécute la régression synthétique (JDK requis)
node .github/scripts/test_meter_ocr_segments.js   # contrat JavaScript + empaquetage natif
```

Photos réelles (restent locales) : fichier TSV `chemin  haut  bas  gauche  droite  étiquette`, coordonnées en pixels de travail (largeur 700) pour `--real`, ou `chemin  gauche  haut  droite  bas  étiquette` en pixels de la photo pour le mode `photo` :

```powershell
node .github/scripts/test_seven_segment_reader.js --real chemin\cases.tsv
```

## Suite recommandée

1. Valider sur tablette avec le test d'instrumentation existant et quelques photos réelles : vérifier les boîtes de ML Kit et la durée.
2. Constituer un jeu étiqueté plus large (au moins 50 photos, plusieurs sites) et le garder hors du dépôt. Rejouer à chaque modification. C'est la condition pour affirmer un taux de lecture.
3. Traiter les afficheurs peu contrastés (égalisation locale plus forte, plusieurs seuils) et les compteurs à rouleaux (lecteur séparé).
4. Guide de cadrage plus serré à la prise de vue : le lecteur est nettement meilleur quand la boîte de ligne est précise.
