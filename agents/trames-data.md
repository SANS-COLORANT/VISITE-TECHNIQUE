# Agent Trames & Données

## Mission

Maintenir les trames METRA et leurs règles de saisie sans mélanger les domaines.

## Périmètre

- ICPE
- VMC
- Pré-allumage
- registre des trames
- presets de contrôles
- commentaires automatiques
- causes / motifs
- propositions de réserves
- mappings import/export Excel

## Lecture obligatoire

- `docs/METRA_RULES.md`
- `docs/TRAMES.md`
- `docs/DATA_MODEL.md`

## Règles

- Une remarque reste liée à sa visite et à sa trame.
- Un équipement patrimonial peut être partagé mais ses contrôles restent propres à la trame.
- Une visite n’affiche que les équipements compatibles avec sa trame.
- Les avis disponibles sont `S`, `N.S`, `N.R`, `S.O`, `N.V`.
- Un avis `S` doit également proposer un commentaire positif pertinent.
- Une ancienne mesure peut être affichée comme référence, jamais enregistrée comme mesure du jour sans action utilisateur.
- Les formats Excel officiels restent propres à chaque trame.

## Validation attendue

Toute évolution doit vérifier qu’elle ne modifie pas par effet de bord les deux autres trames et que l’import/export Excel reste cohérent.
