# REMAR — reprise prudente des acquis ergonomiques (27 octobre 2026)

## État vérifié avant cette branche

- REMAR V1 contient **141 champs/contrôles**, dont **70 contrôles**, dans **17 onglets**.
- REMAR utilise déjà le socle de visite: cinq avis, commentaires et presets, réserves, progression, onglets/sections repliables, filtres À faire / N.S, Tout en S, Idem chauffage, édition de trame versionnée, sauvegarde hors ligne, photos, équipements, Excel.
- ICPE et Réseau de chaleur: relevés, nomenclatures, préremplissage sémantique; VMC: photos même en S et caissons dédiés; Pré-allumage: parcours tactile, accès rapide, locaux dynamiques.
- Constats ciblés: 17 onglets sans index métier; commentaires positifs trop hauts; bouton photo REMAR uniquement en N.S; taille des valeurs à ajuster sur les steppers REMAR.

## Adaptations implémentées ici — **présentation seulement**

1. **Parcours REMAR**: cinq groupes (Chaufferie, CTA, VMC, Froid, Équipements/rapport), bandeau accessible depuis l'en-tête téléphone ou le rail tablette. Chaque groupe liste ses onglets, progression et N.S ; « Reprendre les points à faire » utilise les états de visite déjà calculés, sans les réécrire. Les versions personnalisées conservent leurs onglets supplémentaires dans « Autres onglets ».
2. **S plus compact**: les commentaires satisfaisants sont toujours enregistrés automatiquement et restent affichables/modifiables via « Modifier ». N.S/N.R/S.O/N.V conservent leur fiche complète.
3. **Photos sur tout avis REMAR**: capture dès qu'un avis est choisi. Pour S/N.R/S.O/N.V, la photo est directement liée au contrôle et **ne crée aucune réserve artificielle** ; N.S conserve l'association à la réserve existante.
4. **Mesures lisibles**: steppers numériques REMAR en 16 points avec rétrécissement si nécessaire; boutons +/- conservés. Les autres trames gardent leur format.
5. **Tout déplier / Tout replier** pour les onglets REMAR à plusieurs rubriques, avec les états d'ouverture déjà en mémoire.

## Explicitement inchangé

- Aucun changement à `remarTrame.js`, `templateExcelRemar.js`, `trameRegistry.js`, `trameLibraryDb.js`, migrations, SQLite, identifiants/colonnes Excel, textes de prescriptions, règles d'import/export ou échanges Intranet.
- Aucune transformation des champs de saisie ni des réserves existantes; aucune photo historique dupliquée.
- Aucune modification du fonctionnement des autres trames et du module Missions.
- Développé sur `feat/remar-ergonomie-terrain-20261027`, issu de `feat/trame-remar-complete`, sans interrompre son pipeline APK.

## À ne pas généraliser sans nouvelle version de trame

- REMAR prévoit trois filtres CTA fixes, une zone VMC non multi-caisson et des réseaux sur cellules Excel fixes. Copier automatiquement la dynamique de VMC/ICPE créerait des données sans destination dans le classeur REMAR.
- Un éventuel mode multi-CTA/multi-VMC/multi-filtre nécessite une version de modèle Excel et un plan de migration/import/export testé avant intégration.
- La **reprise entre trames** doit passer par le maillage canonique existant ; ne jamais copier des mesures/observations incompatibles en créant une fausse identité.
- Le mode photo/l'OCR, la sauvegarde SQLite, le parcours complet et la restitution Excel doivent encore être validés sur tablette physique.

## Recette requise

1. Ouvrir une visite REMAR fraîche et existante (hors ligne), accéder directement aux 17 onglets depuis le sommaire et revenir sans perte de l'onglet actif.
2. Dans Conf. Local, remplir 17 contrôles, dont S et N.S, puis réouvrir l'app; vérifier avis, commentaires, réserves et photos.
3. Photographier un contrôle S et un N.S; vérifier qu'un S **ne crée pas de réserve**, qu'un N.S a une réserve liée, que les photos restent visibles dans Photos et sur le rapport.
4. Tester filtres À faire/N.S, Tout en S et annulation, Tout déplier/replier, champs numériques positifs et négatifs, compteurs longs.
5. Import/export du classeur REMAR: vérifier exactement les mêmes cellules, valeurs, photos et formats ; vérifier les trames ICPE/VMC/RCU/Pré-allumage.
6. Tester la création et la reprise de visites à 100+ points, les grandes bibliothèques, et le mode portrait/paysage tablette.
7. Ne fusionner que si les vérifications automatiques, le bundle Android **et** la recette en émulateur/tablette sont satisfaisants.
