# Moteur de trames de visite

La branche `native-android` utilise désormais un registre de trames. Une visite stocke son `trame_id` et l'interface, l'import Excel, l'export Excel et le calcul de progression utilisent cette définition.

## Ajouter une nouvelle trame

Créer d'abord le modèle Excel sous forme de module Base64 dédié, par exemple `templateChaufferieExcel.js`, puis ajouter une définition dans `trameRegistry.js` avec un identifiant stable, par exemple `chaufferie_v1`.

Une définition contient quatre blocs principaux :

- `ui.panels` : sections et champs affichés par l'application.
- `ui.tabOrder` et `ui.labels` : ordre et nom des onglets.
- `ui.specialPanels` : panneaux natifs réutilisables (`p-regulation`, `p-releves`, `p-equip`, `p-remarques`, `p-photos`). Un onglet non déclaré comme spécial est rendu automatiquement par `TrameGenericPanel`.
- `excel` : modèle, détection, cellules de métadonnées, mapping des champs, blocs répétables et feuilles tabulaires.

## Identité et détection

Chaque trame doit avoir un identifiant qui ne change jamais après utilisation :

```js
{
  id: 'chaufferie_v1',
  version: 1,
  nom: 'Chaufferie',
  actif: true,
}
```

`excel.requiredSheets` et `excel.signature` permettent à l'import de reconnaître automatiquement le fichier avant de créer la visite.

```js
requiredSheets: ['CHAUFFERIE'],
signature: {
  sheet: 'CHAUFFERIE',
  cells: [{ ref: 'B4', values: ['CHAUFFERIE'] }],
}
```

## Champs simples et contrôles

Chaque champ possède une identité métier stable (`sectionCode + cle`) indépendante de sa cellule Excel. Le mapping indique uniquement où le lire/écrire dans cette version du modèle.

```js
{
  panelId: 'p-production',
  section: 'Chaudières',
  sectionCode: 'production.chaudieres',
  cle: 'Puissance installée (kW)',
  type: 'champ',
  valueCell: 'D24',
  commentCell: null,
}
```

Pour un contrôle, `valueCell` contient l'avis et `commentCell` le commentaire.

## Éléments répétables

Les réseaux utilisent `excel.networks`. Une trame peut définir ses blocs dans la feuille principale ainsi qu'une feuille `overflow` pour conserver les éléments au-delà du nombre prévu dans le modèle.

Ce mécanisme garantit l'aller-retour : application → Excel → réimport dans l'application sans perdre les réseaux supplémentaires.

## Tables

Les feuilles comme `MATERIEL` et `REMARQUES` sont décrites par :

```js
{
  sheet: 'MATERIEL',
  startRow: 4,
  maxImportRow: 500,
  columns: [['A', 'categorie'], ['B', 'nombre']],
  exportColumns: [['A', 'categorie'], ['B', 'nombre']],
}
```

Les colonnes d'import et d'export peuvent être différentes lorsque les noms internes diffèrent de ceux du fichier Excel.

## Cycle fonctionnel

1. **Nouvelle visite** : l'écran lit `listerTramesDisponibles()` et affiche automatiquement les trames actives.
2. **Saisie** : `VisiteScreen` utilise `trame_id` pour construire ses onglets et `TrameGenericPanel` pour les rubriques génériques.
3. **Progression** : calculée uniquement sur les champs/contrôles définis par la trame active.
4. **Import** : le classeur est détecté automatiquement puis lu avec le mapping de la trame.
5. **Export** : le modèle propre à la trame est rempli à partir des données SQLite de la visite.
6. **Historique** : chaque visite conserve son `trame_id`, donc une évolution future du catalogue de trames ne change pas l'identité des visites existantes.

## Règles de versionnement

Ne jamais réutiliser un identifiant existant pour une structure Excel incompatible. Si les cellules ou la structure métier changent de manière importante, créer une nouvelle version (`chaufferie_v2`) et conserver la précédente tant que des visites historiques peuvent encore être ouvertes ou exportées.

Les modifications purement visuelles ou compatibles peuvent rester dans la même version, mais les anciens imports/exports doivent continuer à fonctionner.
