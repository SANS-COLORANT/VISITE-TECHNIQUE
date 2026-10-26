# TRAME REMAR et bibliothèque de trames

## Utiliser REMAR

Choisir **TRAME REMAR** dans les nouvelles visites ou avec le bouton central +.
Elle utilise la coque de visite, les cartes de rubrique, les cinq avis et les
sauvegardes durables de METRA : aucune interface d’aperçu séparée.

Le modèle comprend les 136 points techniques fournis, plus les cinq informations
d’en-tête. Les domaines sont chaufferie, conformité, distribution, compteurs et
températures, améliorations, CTA/filtration, VMC et production de froid.
L’Excel exporté porte également le nom **TRAME REMAR**. Les anciens classeurs
nommés `TRAME REMAR CLASSIQUE` restent reconnus à l’import.

Les informations administratives viennent du client/site/local réel. Les
informations compatibles du même local peuvent être proposées depuis l’historique
par le maillage commun ; ce sont des références modifiables, pas des constats du
jour validés automatiquement. Aucune tuyauterie, énergie ou conformité n’est
inventée sur un local sans historique. Les avis proposent des commentaires pour
S, N.S, N.R, S.O et N.V après choix explicite du technicien.

## Intégrer et modifier sans développement

Dans **Réglages > Trames** :

1. **Intégrer une trame** accepte un modèle Excel ou un fichier de trame METRA.
   Le lecteur Excel reconnaît la structure d’en-tête Nom du client / Nom du site /
   Date de la visite et les tableaux Intitulé / Avis / Commentaire. Le nom initial
   vient de la feuille, pas du nom du fichier. Les valeurs d’un ancien classeur
   sont effacées du modèle, pour ne pas inventer de nouveaux constats.
2. Vérifier le nom, les onglets, rubriques et points détectés dans le brouillon.
   L’inférence de type est une proposition : elle peut être corrigée avant sauvegarde.
3. Toucher un point pour choisir information/mesure ou contrôle ; modifier les
   choix rapides, l’unité, les limites/pas numériques et les commentaires par avis.
4. Ajouter/retirer un point, ajouter/renommer une rubrique, ajouter/renommer et
   déplacer un onglet. Les informations d’en-tête sont conservées pour les exports.
   Les points supplémentaires sont ajoutés au modèle Excel sans déplacer les
   cellules officielles existantes.
5. **Enregistrer cette version** la rend disponible pour les prochaines visites.

La copie des anciennes trames spécialisées reste une **copie générique** : elle
ne remplace ni leur navigation spécifique ni leurs règles Intranet. L’original
reste disponible. Pour ajuster REMAR ou une trame déjà personnalisée, une nouvelle
version devient la version proposée de cette même famille.

**Exporter le modèle Excel** produit un modèle partageable. **Partager la trame
modifiable** produit un fichier METRA qui peut être réimporté sur une autre
tablette. Les modèles Excel exportés/visites exportées incluent aussi une feuille
masquée `METRA_TRAME` permettant de retrouver la définition exacte au réimport.
Conserver cette feuille pour transférer une trame personnalisée sans ambiguïté.

## Historique et sauvegarde

Une version enregistrée est conservée dans la base METRA (`_meta`) avec son
modèle Excel et sa définition. Chaque visite garde l’identifiant de sa version :
modifier ou masquer une trame n’efface aucune ancienne visite. La sauvegarde de
base existante inclut cette bibliothèque. Le schéma reste 47, sans migration
régressive ni réinitialisation de la base.

Une trame masquée reste lisible dans l’historique ; elle n’est plus proposée pour
les nouvelles visites. Elle peut être réactivée depuis la bibliothèque.
Les fichiers sont limités à 5 Mo et les définitions à 600 points ; le lecteur
refuse les mappings ambigus au lieu d’écraser des cellules.

## Application complète et build

La branche de livraison part de la version APK 678 (`beaa6bc…`) avec le correctif
PDF/validation photo `f4b05f6…`, plutôt que de l’ancienne branche sélectionnée
initialement. L’APK utilise **METRA**, `com.visitetechnique.tablet`, le certificat
historique et un versionCode croissant ; il ne crée pas une application séparée.

Le workflow `METRA complete - TRAME REMAR` exécute `npm ci`/les contrats sans
réparer les sources, les tests REMAR/bibliothèque, la non-régression PDF 457 photos,
le bundle, Gradle release, la vérification d’identité/signature et un parcours
sur émulateur avant de publier l’APK. Aucun des anciens patches runtime n’y est
appelé. Les seules générations sont le packaging Android et les métadonnées de build.

Validation locale des nouveaux comportements :

```sh
node --experimental-test-module-mocks --test tests/trameRemar.test.mjs
node tests/reportPdfFragments.test.mjs
npm run verify:metra
```

Node 24 est requis pour la suite SQLite native et les mocks de modules. Les
contrôles de terrain (caméra/OCR sur matériel physique, accès Intranet et gros PDF
réels) ne sont pas remplacés par un passage sur émulateur.
