# Fiches d'aide par appui long

Un **appui long** (≈ 0,55 s) ouvre une fiche explicative des règles. L'écran de visite ne change pas : aucun bouton ajouté.

- **Onglet** (barre d'onglets, liste latérale en tablette) : liste des règles de l'onglet, chacune avec sa nature et une phrase ; un toucher ouvre la fiche, avec retour à l'onglet.
- **Ligne de contrôle** (intitulé d'un contrôle S / N.S / N.R / S.O / N.V) : la fiche de la règle rattachée, avec l'action propre à la ligne.
- Appui court : navigation et saisie inchangées. Faire défiler annule l'appui long.

## Contenu d'une fiche

Nature (Obligation applicable ou conditionnelle, Prescription technique, Conseil d'exploitation, Règle à déterminer) · en bref · schéma ou calcul quand il existe · points à vérifier (cases locales) · preuves à recueillir · à compléter avant décision · fiche complète et sources cliquables.

Schémas et calculs : ventilation basse et haute (SVB ≥ max(P/23 ; 2,5) dm², SVH ≥ max(A/10 ; 2,5) dm², avec coefficient de grille), extincteurs, issues, gaine pompiers, chaîne de détection gaz, températures ECS, débits VMC, compteurs (écart d'index, P ≈ 1,163 × q × ΔT).

Ventilation : la puissance est reprise du champ « Puissance totale installée (kW) » de la visite quand il est lisible (une saisie ambiguë comme « 2 x 150 » n'est pas reprise) ; la surface du local se saisit dans la fiche et n'est pas enregistrée.

## Garde-fous (dossier des aides du 9 octobre 2026)

- Ouvrir une aide ne modifie **aucun avis**, ne crée **aucune réserve** et n'écrit rien en base.
- Un calcul est une « aide de dimensionnement » (ou « repère, pas un avis ») ; il n'écrit jamais S ou N.S.
- Donnée absente : « Données manquantes », jamais de seuil par défaut. Hors domaine (P ≥ 2 000 kW, gaines, ventilation mécanique) : renvoi vers une note aéraulique.
- Plusieurs fiches restent « à compléter » : la mention est affichée telle quelle.
- Tout est local (hors connexion) ; les sources externes demandent Internet.

## Données

`aideReglementaireData.js` est généré par `tools/aide-reglementaire/generate_data.py` à partir de `METRA_catalogue_aides.json` (64 fiches, 904 lignes rattachées). Ne pas le modifier à la main. Logique pure : `aideReglementaire.js` ; interface : `AideReglementaire.js` ; contrôle : `.github/scripts/test_aide_reglementaire.js`.

La correspondance avec une ligne repose sur le code de section et l'intitulé exact ; les lignes des panneaux spéciaux (Régulation, Relevés) n'ont pas d'appui long de ligne, mais leur onglet a sa fiche.
