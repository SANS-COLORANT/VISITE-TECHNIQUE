# METRA · Visite technique

Application React Native / Expo SDK 51 avec une base SQLite locale.

## Trame REMAR · CROUS

Depuis un site, choisir **Nouvelle visite → Visite complète · REMAR · CROUS**.
Le modèle fourni `Trame_REMAR_CROUS.xlsx` est intégré : chaufferie, conformité,
distribution, relevés, améliorations, CTA et filtration, VMC, production de froid.
Ses 136 points sont complétés par le nom du local présent dans l’en-tête Excel.

- Les informations utilisent les sélections existantes ou du texte libre ; les
  températures et consignes disposent de commandes numériques adaptées.
- **Ajouter un point** ajoute une information/mesure ou un contrôle avec avis dans
  la section choisie. Les ajouts sont propres à la visite.
- **Retirer ce point** masque le point après confirmation, en conservant ses
  observations. **Réafficher** le restaure. La progression suit les points actifs.
- Les équipements, photos et réserves utilisent les outils existants. Le matériel
  REMAR comprend également nombre, numéro, réseau desservi et caractéristiques.
- Le mode Express reprend la trame et ses personnalisations. Comme pour les trames
  existantes, les équipements permanents restent associés au site. Les index et
  températures REMAR sont remis à renseigner ; la date et les informations du site
  sont préremplies.

**Exporter** utilise le classeur d’origine. Les ajouts et les points retirés sont
conservés avec leurs valeurs dans une feuille supplémentaire `PERSONNALISATION`.
Conserver cette feuille pour retrouver les personnalisations au réimport.
Les onglets `MATERIEL`, `REMARQUES` et `NOTE` restent disponibles. Le modèle vierge
est également reconnu par **Importer Excel** ; les en-têtes client/site sont alors
à renseigner dans Excel pour éviter les noms de remplacement « Client importé »
et « Site importé ».

La migration SQLite 9 conserve les visites existantes ; aucune réinitialisation
manuelle de la base n’est nécessaire.

## Développement et vérifications

Avec Node.js 24 (utilisé pour les tests SQLite) et npm :

```sh
npm install --package-lock=false
npx expo start --offline
node --experimental-test-module-mocks --test tests/remar.test.mjs
CI=1 EXPO_OFFLINE=1 npx expo export --platform android --platform ios --max-workers 2 --output-dir /tmp/metra-export
```

Le dépôt ne contient pas de fichier de verrouillage des dépendances.
Les tests exécutent le code d’import/export et les migrations contre SQLite réel
via Node ; seules les API natives Expo sont remplacées. Ils couvrent les 137 points,
l’aller-retour Excel, la personnalisation, les colonnes matériel/réserves, le mode
Express, la progression et la compatibilité des trames précédentes.

La compilation des bundles ne remplace pas un essai sur appareil : caméra,
partage, clavier et ergonomie tactile restent à vérifier sur Android/iOS compatible
avec Expo SDK 51.

## APK d’aperçu sur GitHub

Le workflow `Build REMAR CROUS preview APK` construit et publie une préversion
à chaque envoi sur `feat/remar-crous-template`. Il exécute les tests, génère le
projet Android, compile un APK autonome et vérifie sa signature.

L’application **METRA REMAR - Aperçu** utilise l’identifiant Android
`com.visitetechnique.remarcrous.preview` et sa propre base locale. Elle s’installe
à côté des autres versions METRA ; elle ne les remplace pas et ne reprend pas
automatiquement leurs données. Ce choix permet de tester cette branche Expo 51
sans remplacer l’application issue de la branche `native-android`.
