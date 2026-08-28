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
    "layers": [
      {
        "asset": "logos/startup.svg",
        "startMs": 100,
        "durationMs": 900,
        "width": 220,
        "height": 160,
        "left": "50%",
        "top": "48%",
        "easing": "ease-out",
        "from": { "opacity": 0, "scale": 0.7, "translateY": 20, "rotate": -4 },
        "to": { "opacity": 1, "scale": 1, "translateY": 0, "rotate": 0 }
      }
    ],
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

## Animations pilotées par le pack

`startup.layers` permet d'animer des fichiers PNG/JPG/SVG sans ajouter de nouveau composant dans le code. Chaque calque peut définir :

- `startMs` et `durationMs` ;
- `opacity` ;
- `scale` ;
- `translateX` / `translateY` ;
- `rotate` ;
- `easing` : `linear`, `ease-in`, `ease-out`, `ease-in-out` ou `back` ;
- sa position et sa taille (`left`, `top`, `width`, `height`).

Le champ `startup.base` peut être `classic`, `doom` ou `none`. Avec `none`, le pack contrôle entièrement l'écran de démarrage à l'aide de ses calques.

## Effets disponibles

Le moteur accepte actuellement `snow`, `sparkles`, `confetti` et `leaves`. Les paramètres communs sont `count`, `durationMinMs`, `durationMaxMs`, `sizeMin`, `sizeMax`, `opacityMin`, `opacityMax`, `wind`, `symbol` ou `symbols`.

## Import sur une tablette

Créer un fichier ZIP contenant le `manifest.json` à la racine du pack (ou dans un unique dossier de premier niveau), puis utiliser **Paramètres > Apparence > Importer un pack visuel (.zip)**. Le pack est copié dans le stockage local de l'application et reste disponible hors ligne.

Les logos d'interface peuvent être en PNG, JPG ou SVG. L'icône Android affichée sur l'écran d'accueil de la tablette reste une ressource de l'APK et n'est pas remplacée par un pack visuel.

Le thème classique reste intégré à l'APK comme solution de secours. Un pack invalide n'est jamais activé automatiquement.
