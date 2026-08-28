# Packs visuels METRA

Ce dossier est l'unique emplacement de référence pour les thèmes, animations et effets visuels de l'application. Les rapports PDF, Word et Excel ne lisent jamais ces fichiers : les packs ne concernent que l'interface de METRA.

## Arborescence

```text
visual-packs/
├── README.md
├── runtime/                 # moteur commun, pas de thème métier en double
│   ├── VisualEffectLayer.js
│   ├── VisualPackAnimatedLayer.js
│   ├── VisualPackAsset.js
│   ├── VisualPackLoadingScreen.js
│   ├── visualPackManager.js
│   └── visualPaletteRuntime.js
├── shared/
│   └── assets/              # éléments METRA partagés par plusieurs packs
├── classic/
│   ├── manifest.json
│   └── StartupAnimation.js
├── doom/
│   ├── manifest.json
│   ├── StartupAnimation.js
│   └── vector/              # données vectorielles du masque Doom
└── noel/
    └── manifest.json
```

Le code racine de l'application ne contient donc plus de `DoomLoadingScreen`, `MetraLoadingScreen`, fichiers `DoomMaskPaths*` ou ancien système `themePreference`. Les particularités d'un pack restent dans `visual-packs/`.

## Structure d'un pack importable

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
  "colors": {
    "main": "#F26426",
    "dark": "#D9531A",
    "light": "#FFF1EA"
  },
  "startup": {
    "preset": "none",
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

## Animations

`startup.preset` peut être :

- `metra-classic` : animation METRA classique intégrée ;
- `metra-doom` : animation Doom intégrée ;
- `none` : le pack contrôle entièrement l'écran avec ses propres calques.

Pour les nouveaux packs externes, privilégier `none` avec `startup.layers` : cela permet d'ajouter des PNG/JPG/SVG et leurs animations sans créer de nouveau composant JavaScript.

Chaque calque peut définir `startMs`, `durationMs`, `opacity`, `scale`, `translateX`, `translateY`, `rotate`, sa position, sa taille et un easing parmi `linear`, `ease-in`, `ease-out`, `ease-in-out` ou `back`.

## Effets disponibles

Le moteur accepte `snow`, `sparkles`, `confetti` et `leaves`. Les paramètres communs sont `count`, `durationMinMs`, `durationMaxMs`, `sizeMin`, `sizeMax`, `opacityMin`, `opacityMax`, `wind`, `symbol` ou `symbols`.

## Import sur une tablette

Créer un ZIP contenant `manifest.json` à la racine du pack, ou dans un unique dossier de premier niveau, puis utiliser **Paramètres > Apparence et packs visuels > Importer un pack visuel (.zip)**. Le contenu est copié dans le stockage local de l'application et reste disponible hors ligne.

Les logos d'interface peuvent être en PNG, JPG ou SVG. L'icône Android de la tablette reste une ressource de l'APK.

Le pack Classique est toujours intégré comme solution de secours. Un pack invalide est ignoré et ne bloque jamais le démarrage de l'application.

## Compatibilité avec les anciennes installations

Au premier lancement après migration, si aucune préférence `active_visual_pack` n'existe encore, le moteur lit une seule fois l'ancienne valeur `app_theme_mode` afin de conserver le choix Classique/Doom de l'utilisateur. Les anciens ZIP utilisant `startup.base` restent également acceptés et sont convertis en mémoire vers le nouveau champ `startup.preset`.
