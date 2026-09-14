# METRA — Direction visuelle Home V2

Ce dossier fige la direction artistique validée pour la refonte visuelle premium de METRA. Il sert de référence pour l'intégration du visual pack `spiral-active` et pour l'harmonisation progressive des écrans internes.

## Principes non négociables

- **La spirale existante ne doit pas être redessinée ni remplacée.** Sa forme, son identité et son rôle central restent ceux du visual pack actuel.
- **Les commandes placées à droite et à gauche de la spirale restent en place.** La nouvelle DA doit s'organiser autour d'elles, pas les remplacer.
- **La refonte visuelle doit rester réversible.** Désactiver les animations / le visual pack doit restituer l'interface de base et ses éléments fonctionnels. La DA ne doit donc pas déplacer la logique métier, les routes ou les données dans le visual pack.
- Le visual pack peut modifier la présentation, les transitions, les cartes et les assets décoratifs, mais pas la source de vérité fonctionnelle.
- L'application reste offline-first.

## Direction retenue

### Fond et surfaces

- Fond principal blanc cassé / ivoire très clair.
- Cartes et bulles : blanc ou gris très clair.
- Éviter les grands aplats sombres qui font « tache » dans l'écran.
- Traits fins gris bleuté / anthracite pour structurer sans alourdir.
- Ombres légères et diffuses, jamais de grosses ombres noires.

### Couleurs

- Orange : accent d'action, sélection ou criticité.
- Vert : statut positif / online / conforme.
- Anthracite / bleu nuit : texte et icônes.
- Gris clair : fonds secondaires et états neutres.
- La spirale conserve ses couleurs existantes.

### Photos clients / sites

La logique de vignettes photo est validée.

- Une fiche client ou site peut afficher une photo représentative du bâtiment.
- La photo doit être utile visuellement, pas décorative : elle aide à reconnaître rapidement le site.
- Format recommandé : rectangle arrondi, intégré à la carte, avec cadrage stable.
- En absence de photo, conserver un fallback propre (icône bâtiment / placeholder clair).
- Les photos de référence ne doivent jamais remplacer les données du site ; elles restent une couche de présentation.

### Accueil

- Conserver la scène architecturale en arrière-plan et ses bâtiments indépendants.
- Les bâtiments peuvent être interactifs et se soulever légèrement à la sélection.
- Conserver la recherche client et les informations utiles au-dessus de la scène dans des surfaces claires.
- Ne pas recréer une barre de navigation générique qui remplacerait la spirale ou les commandes déjà présentes autour d'elle.
- L'animation d'entrée et l'animation de retour à l'accueil restent des comportements du visual pack.

## Écrans à harmoniser

La même DA doit être déclinée sans perdre l'ergonomie métier :

1. Répertoire / recherche clients et sites.
2. Fiche client et fiche site.
3. Patrimoine.
4. Matrice technique.
5. Visite terrain / contrôles / réserves / photos.
6. Rapports.
7. Carte et documents.
8. Paramètres liés au visual pack.

## Système de composants visuels recommandé

- En-tête clair, titre fort, sous-titre discret.
- Cartes blanches avec bord fin et rayon cohérent.
- Vignettes bâtiment / client lorsque disponibles.
- Boutons principaux blancs avec contour ; orange uniquement pour l'état actif ou l'action importante.
- Segmented controls / filtres sur fond gris très clair.
- Badges de statut compacts.
- Informations secondaires dans une typographie plus légère, jamais dans un gros bloc sombre.
- Photos terrain présentées en cartes propres avec légende et date.

## Règle de réversibilité du visual pack

Toute évolution issue de cette DA doit respecter ce contrat :

1. L'écran fonctionnel de base existe sans `spiral-active`.
2. Le visual pack peut décorer ou animer l'écran mais ne doit pas être requis pour utiliser la fonctionnalité.
3. Si le visual pack ou les animations visuelles sont désactivés, les composants natifs de base redeviennent immédiatement visibles et utilisables.
4. Les clics, données, synchronisation, exports et navigation ne doivent pas dépendre d'un asset décoratif.
5. Les nouveaux assets restent isolés dans le visual pack ou dans un dossier de référence dédié.

## Maquettes de référence

Deux directions ont été validées comme références de travail :

- **Accueil / tableau de bord** : fond clair, scène bâtiment, recherche et fiche site avec photo, sans remplacer la spirale existante ni ses commandes latérales.
- **Fiche site / client** : grande photo bâtiment, informations synthétiques, cartes blanches, accès rapides et historique des visites.

Les images de maquette sont des références de DA uniquement : elles ne doivent pas être utilisées comme écrans aplatis dans l'application. L'intégration finale doit rester composée de vrais composants React Native accessibles, interactifs et réversibles.

## Ordre d'intégration

1. Stabiliser l'accueil et le démarrage.
2. Appliquer les surfaces claires et le système de photo aux écrans client/site.
3. Harmoniser Patrimoine et Matrice technique.
4. Harmoniser Visite terrain en conservant en priorité la rapidité de saisie.
5. Harmoniser Rapport / Documents / Carte.
6. Vérifier le fallback complet avec le visual pack désactivé.

## Validation visuelle

Pour chaque écran, vérifier au minimum :

- lisibilité en portrait tablette ;
- aucun changement de logique métier ;
- contraste suffisant ;
- zones tactiles confortables ;
- aucune perte de fonction en mode offline ;
- rendu cohérent avec l'accueil ;
- retour propre à l'interface de base lorsque les animations / le visual pack sont désactivés.
