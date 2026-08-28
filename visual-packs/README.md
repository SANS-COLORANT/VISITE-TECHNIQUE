# Packs visuels METRA

Ce dossier définit le format des thèmes visuels de l'application. Les rapports PDF, Word et Excel ne lisent jamais ces fichiers : les packs ne concernent que l'interface de l'application.

## Structure d'un pack

```text
mon-pack/
├── manifest.json
├── logos/
│   ├── startup.svg
│   └── header.png
├── backgrounds/
└── effects/
```

Le fichier `manifest.json` est obligatoire. Exemple :

```json
{
  "schemaVersion": 1,
  "id": "mon-pack",
  "name": "Mon pack",
  "version": 1,
  "legacyTheme": "classic",
  "colors": {
    "main": "#F26426",
    "dark": "#D9531A",
    "light": "#FFF1EA"
  },
  "startup": {
    "base": "classic",
    "durationMs": 3200,
    "logo": "logos/startup.svg",
    "effect": {
      "type": "snow",
      "count": 30
    }
  },
  "interface": {
    "headerLogo": "logos/header.png"
  }
}
```

## Effets disponibles

Le moteur accepte actuellement `snow`, `sparkles`, `confetti` et `leaves`. Les paramètres communs sont `count`, `durationMinMs`, `durationMaxMs`, `sizeMin`, `sizeMax`, `opacityMin`, `opacityMax`, `wind`, `symbol` ou `symbols`.

## Import sur une tablette

Créer un fichier ZIP contenant le `manifest.json` à la racine du pack (ou dans un unique dossier de premier niveau), puis utiliser **Paramètres > Apparence > Importer un pack visuel (.zip)**. Le pack est copié dans le stockage local de l'application et reste disponible hors ligne.

Le thème classique reste intégré à l'APK comme solution de secours. Un pack invalide n'est jamais activé automatiquement.
