# Direction artistique METRA — « Verre chaud »

Direction validée par le porteur du projet le 25/09/2026, parmi trois propositions
(maquette de référence : https://claude.ai/artifact/EpbszY8T1AoUnTJvXG7XLT, colonne B ;
détail de l'écran Visite : https://claude.ai/artifact/TZpDuD3AKdnqPwR6J1WowT).
Toute l'application suit cette DA. Un nouvel écran ou une retouche qui s'en écarte doit
être justifié et validé avant d'être livré.

## Principes

1. **Fond crème chaud + halos** : fond `COLORS.bg` (#F3F1EC) sur lequel
   `AmbientBackground` (racine de `App.js`) pose deux halos de l'accent en dégradé
   radial. Les écrans de navigation laissent leur racine transparente pour que le fond
   ambiant soit visible ; ne pas leur remettre un `backgroundColor` opaque.
2. **Surfaces en verre** : cartes translucides (`rgba(255,255,255,0.8)`), bordure fine
   `rgba(22,21,15,0.1)`, ombre à deux niveaux. Le vrai flou natif (`GlassCard`,
   `@react-native-community/blur`) est réservé aux éléments phares (carte « Reprendre »,
   jauge de visite), pas aux listes, pour préserver la fluidité du défilement.
   `expo-blur` est proscrit : il ne floute jamais sur Android.
3. **Accent en dégradé** : actions principales, onglet actif et repère de marque en
   dégradé `orange → orangeDark` avec halo d'ombre de la même couleur.
4. **Icônes, pas de texte ni d'emoji** : pictogrammes SVG `CvcIcon`
   (`MetraCvcIcons.js`), posés dans `IconOrb` (fond duoton + anneau d'accent) quand ils
   représentent un objet ou une action. Aucun emoji ni glyphe Unicode comme icône.
5. **Typographie** : Sora pour les titres et les chiffres, Inter pour le texte
   (`AppFonts.js`, constantes `FONTS` dans `styles.js`). Tout nouveau style de texte
   partagé porte un `fontFamily`.
6. **Jauge circulaire** : une progression se montre avec `ProgressRing`, pas avec une
   barre ni un pourcentage seul.

## Structure de navigation

- Barre de navigation du bas `BottomTabBar` (Accueil, Clients, Missions si activé,
  Réglages), dans le flux et non en surimpression. Masquée sur les écrans de saisie
  plein écran (Visite, Rapport, LAB 3D, Schéma).
- En-têtes : fond transparent, bouton retour en verre (`simpleHeaderBack`), grand titre
  aligné à gauche (`simpleHeaderTitle`).

## Thèmes

- Visite Technique : accent orange `#F26426` / `#D9531A`.
- Missions : même DA, accent vert `MISSION_COLORS.accent` / `accentDark`.

## Composants de référence

| Besoin | Composant / style |
|---|---|
| Fond d'écran | `AmbientBackground` (`premiumChrome.js`) |
| Carte phare avec flou | `GlassCard` |
| Icône d'objet ou d'action | `IconOrb` + `CvcIcon` |
| Progression | `ProgressRing` |
| Apparition à l'écran | `FadeUp` |
| Navigation principale | `BottomTabBar` |
| Carte de liste / formulaire | `styles.card`, `styles.formCard` |
