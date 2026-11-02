# Écart réel METRA REMAR / Symfony « REMAR CLASSIQUE » — trame 16
Date : 02/11/2026. Nature : dossier de correction **côté Symfony** et recette **sans perte**.

## Diagnostic vérifié
Le rapport de terrain comporte **42 blocages** : 2 avis non confirmés, 1 faux blocage réseau, **39 champs métiers non associés**.
Le catalogue figé communiqué est « REMAR CLASSIQUE » **ID 16**. L'extrait contient 69 critères complets, plus une dernière ligne coupée (« Vannes 3 voies ») : **extrait incomplet**. Ne pas prétendre que les critères affichés forment la totalité du serveur.
Les critères chauffage **303, 304, 305, 306, 307** (sous-catégorie **89**, catégorie **53**) existent pour les cinq réseaux : le message « Réseau REMAR 1 : aucune case » est un **défaut de résolution METRA** dû au doublon « Réseau 1 » entre chauffage et froid, corrigé dans le sérialiseur.
Le serveur marque comme **avisApplicable=oui** les compteurs d'énergie, ECS, appoint (233, 235, 236) et les températures 228–232, alors que METRA les stocke comme **champs numériques**. Un correctif empêche les relevés d'être remplacés par « / » sur ces critères.

## Écart de contenu à corriger
Les 39 observations du rapport ne sont pas retrouvées dans les critères Symfony figés de cette visite :
- **24 CTA** : fiches, contrôles d'entretien, filtres, mesures et améliorations ;
- **12 VMC** : informations, situation, caisson et distribution ;
- **3 froid** : production, support anti-vibratile et acoustique.

**Interdictions de contournement :**
1. Ne jamais associer « GTB » de la CTA au critère « GTB » de la chaufferie ou « Réseau 1 » du froid au chauffage ; les **triplets (catégorie/sous-catégorie/critère)** et le contexte métier doivent être corrects.
2. Ne pas injecter ces observations dans un critère chaufferie sans rapport, ni dans les `notes[]` pour déclarer l'envoi complet : la préparation Symfony V1 restitue les notes comme `[]`, donc les observations deviendraient difficiles à retrouver et réimporter.
3. Ne pas créer d'ID numérique de critère dans METRA. **Symfony alloue et publie les IDs définitifs**.
4. Ne pas retirer les contrôles anti-écrasement du listing matériel (incident A2 des Ulis) ou les protections d'idempotence.
5. Ne pas confirmer automatiquement les deux avis non vérifiés : CTA « double flux » / Calorifugeage et CTA « Triple » / Vannes de régulation.

## Contrat demandé à l'équipe Symfony
- Créer **une version complète de REMAR** (ou compléter additivement le catalogue 16 après revue de compatibilité), en conservant les anciens IDs et historiques. Les nouvelles catégories doivent distinguer **CTA, Filtration CTA, Mesures CTA, Améliorations CTA, VMC et Production de froid**, séparées des catégories chaufferie.
- Publier chaque point de la trame locale dans la préparation autorisée pour ce local, avec identifiant serveur stable et `avisApplicable` conforme à son type métier. Éviter de déclarer comme contrôle un simple index ou une température sans statut réglementaire.
- Lorsqu'une même destination reçoit **plusieurs équipements**, accepter des commentaires **multilignes** conservant nom, valeur, unité, avis individuel et constat par équipement. Limite V1 du commentaire : **1500 caractères**, sans troncature. Prévoir une API structurée V2 si le volume ne tient pas.
- S'assurer que la trame publiée est exactement celle que METRA prépare : vérifier `?trame=<ID numérique>`, `local.type_trame`, correspondance des critères, dernière visite et données en cache.
- Exécuter `GET préparation → POST authentifié → GET → export Excel Intranet`, avec **2 CTA, 2 VMC, 2 groupes froid, filtres et compteurs multiples**, et comparer par identifiant. Recette A2 obligatoire pour l'inventaire.
- Ne jamais attribuer un avis satisfaisant aux mesures purement numériques. Le serveur V1 accepte N.V en présence d'un commentaire, mais l'équipe métier doit confirmer le statut attendu pour ces critères dans une prochaine version.
- Pour une visite déjà figée sur **trame 16**, ne pas modifier silencieusement l'ID de trame ou le JSON d'un envoi déjà tenté. Réassocier seulement avant premier POST et après contrôle explicite du référencement.

## Les 39 saisies actuellement sans destination reconnue
| Panneau METRA | Section | Champ | Type |
|---|---|---|---|
| `p-remar-cta` | Informations techniques | Désignation CTA | champ |
| `p-remar-cta` | Informations techniques | Année CTA | champ |
| `p-remar-cta` | Informations techniques | Type traitement d'air | champ |
| `p-remar-cta` | Informations techniques | Type de batterie | champ |
| `p-remar-cta` | Informations techniques | Contrôle d'humidité | champ |
| `p-remar-cta` | Informations techniques | Récupération d'énergie | champ |
| `p-remar-cta` | Informations techniques | Raccordement GTC | champ |
| `p-remar-cta` | Avis sur l’entretien général | Eclairage du caisson | controle |
| `p-remar-cta` | Avis sur l’entretien général | Date du dernier remplacement de filtre | controle |
| `p-remar-cta` | Avis sur l’entretien général | Date de la dernière qualification | controle |
| `p-remar-cta` | Avis sur l’entretien général | Nettoyage des gaines horizontal & vertical | controle |
| `p-remar-cta` | Avis sur l’entretien général | Calorifugeage | controle |
| `p-remar-filtres` | Filtre n°1 | Type de filtre | champ |
| `p-remar-filtres` | Filtre n°1 | Etat du filtre | controle |
| `p-remar-cta-mesures` | Températures | Air neuf | champ |
| `p-remar-cta-mesures` | Températures | Après récupération | champ |
| `p-remar-cta-mesures` | Températures | Soufflage | champ |
| `p-remar-cta-mesures` | Variation de vitesse | Soufflage | champ |
| `p-remar-cta-energie` | CTA | GTB | controle |
| `p-remar-cta-energie` | CTA | Variateur | controle |
| `p-remar-cta-energie` | CTA | Efficacité du récupérateur | controle |
| `p-remar-cta-energie` | CTA | Efficacité des moteurs | controle |
| `p-remar-cta-energie` | CTA | Consignes / programmes | controle |
| `p-remar-cta-energie` | CTA | Vannes de régulation | controle |
| `p-remar-vmc` | Informations générales | Type de ventilation | champ |
| `p-remar-vmc` | Informations générales | Nombre de caissons | champ |
| `p-remar-vmc` | Informations générales | Type de bouche | champ |
| `p-remar-vmc` | Situation | Situation du caisson | controle |
| `p-remar-vmc` | Situation | Accès au caisson | controle |
| `p-remar-vmc` | Situation | Garde-corps / ligne de vie | controle |
| `p-remar-vmc` | Caisson | Etat du caisson | controle |
| `p-remar-vmc` | Caisson | Fonctionnement | controle |
| `p-remar-vmc` | Caisson | Nettoyage caisson | controle |
| `p-remar-vmc` | Caisson | Etat courroie | controle |
| `p-remar-vmc` | Caisson | Coupure électrique | controle |
| `p-remar-vmc` | Distribution | Etat manchette | controle |
| `p-remar-froid` | Informations du site | Production froid | champ |
| `p-remar-froid` | Informations du site | Support anti-vibratile | champ |
| `p-remar-froid` | Informations du site | Traitement acoustique | champ |

## Contrat total local : 141 points officiels
Cette liste est le **référentiel local** à confronter au catalogue Symfony complet ; ne pas se limiter aux 39 points remplis pendant la visite test.

| Panneau METRA | Section | Champ | Type |
|---|---|---|---|
| `p-infos` | Général | Nom du client | champ |
| `p-infos` | Général | Nom du site | champ |
| `p-infos` | Général | Nom du local | champ |
| `p-infos` | Général | Trame utilisée | champ |
| `p-infos` | Général | Date de la visite | champ |
| `p-infos` | Informations générales | Date de visite | champ |
| `p-infos` | Informations générales | Nom du site | champ |
| `p-infos` | Informations générales | Adresse | champ |
| `p-infos` | Informations générales | Nb bâtiment, nb logement & surface | champ |
| `p-infos` | Informations générales | Production chauffage | champ |
| `p-infos` | Informations générales | Type de régulation | champ |
| `p-infos` | Informations générales | Production ECS | champ |
| `p-infos` | Informations générales | Situation | champ |
| `p-infos` | Informations générales | Accessibilité | champ |
| `p-remar-reseaux` | Réseaux chauffage | Réseau 1 | champ |
| `p-remar-reseaux` | Réseaux chauffage | Réseau 2 | champ |
| `p-remar-reseaux` | Réseaux chauffage | Réseau 3 | champ |
| `p-remar-reseaux` | Réseaux chauffage | Réseau 4 | champ |
| `p-remar-reseaux` | Réseaux chauffage | Réseau 5 | champ |
| `p-conf-local` | Conformité Local | Coupure extérieure Gaz | controle |
| `p-conf-local` | Conformité Local | Coupure extérieure électrique | controle |
| `p-conf-local` | Conformité Local | Porte d'accès | controle |
| `p-conf-local` | Conformité Local | BAES | controle |
| `p-conf-local` | Conformité Local | Ventilation | controle |
| `p-conf-local` | Conformité Local | Extincteurs | controle |
| `p-conf-local` | Conformité Local | Gaine pompiers | controle |
| `p-conf-local` | Conformité Local | Consignes de sécurité | controle |
| `p-conf-local` | Conformité Local | Schéma hydraulique à jour | controle |
| `p-conf-local` | Conformité Local | Armoire électrique | controle |
| `p-conf-local` | Conformité Local | Ligne de Gaz | controle |
| `p-conf-local` | Conformité Local | Evacuation des EU | controle |
| `p-conf-local` | Conformité Local | Eclairage | controle |
| `p-conf-local` | Conformité Local | Chemins de câbles électriques avec liaison équipotentiel | controle |
| `p-conf-local` | Conformité Local | Etat du local | controle |
| `p-conf-local` | Conformité Local | Point de puisage | controle |
| `p-conf-local` | Conformité Local | Calorifuge | controle |
| `p-conf-chauffage` | Conformité Chauffage | Traitement d'eau | controle |
| `p-conf-chauffage` | Conformité Chauffage | Vase d'expansion | controle |
| `p-conf-chauffage` | Conformité Chauffage | Soupape | controle |
| `p-conf-chauffage` | Conformité Chauffage | Désemboueur | controle |
| `p-conf-chauffage` | Conformité Chauffage | Conduits de fumées | controle |
| `p-conf-chauffage` | Conformité Chauffage | Disconnecteur | controle |
| `p-conf-chauffage` | Conformité Chauffage | Adoucisseur | controle |
| `p-conf-ecs` | Conformité ECS | Filtres | controle |
| `p-conf-ecs` | Conformité ECS | Produit de traitement | controle |
| `p-conf-ecs` | Conformité ECS | Manchettes témoins | controle |
| `p-conf-ecs` | Conformité ECS | Vanne de vidange sur ballon | controle |
| `p-conf-ecs` | Conformité ECS | Robinet de prélèvement (départ, bouclage) | controle |
| `p-conf-ecs` | Conformité ECS | Soupape | controle |
| `p-conf-ecs` | Conformité ECS | Adoucisseur | controle |
| `p-distrib` | Distribution Chauffage | Matériaux tuyauterie | champ |
| `p-distrib` | Distribution Chauffage | Type de distribution | champ |
| `p-distrib` | Distribution Chauffage | Type d'émetteur | champ |
| `p-distrib` | Distribution Chauffage | Type de robinetterie | champ |
| `p-distrib` | Distribution Chauffage | Calorifuge (type / état) | champ |
| `p-distrib` | Distribution Chauffage | Variation de vitesse | champ |
| `p-distrib` | Distribution ECS | Matériaux tuyauterie | champ |
| `p-distrib` | Distribution ECS | Type de distribution | champ |
| `p-distrib` | Distribution ECS | Calorifuge (type / état) | champ |
| `p-distrib` | Distribution ECS | Variation de vitesse | champ |
| `p-remar-releves` | Compteur | Compteur Gaz (m³) | champ |
| `p-remar-releves` | Compteur | Compteur d'énergie (MWh) | champ |
| `p-remar-releves` | Compteur | Compteur ECS (m³) | champ |
| `p-remar-releves` | Compteur | Compteur appoint (m³) | champ |
| `p-remar-releves` | Température chaufferie | Chauffage aller (°C) | champ |
| `p-remar-releves` | Température chaufferie | Chauffage retour (°C) | champ |
| `p-remar-releves` | Température chaufferie | ECS départ (°C) | champ |
| `p-remar-releves` | Température chaufferie | ECS bouclage (°C) | champ |
| `p-remar-releves` | Température chaufferie | ECS stockage (°C) | champ |
| `p-remar-energie` | Chaufferie | GTB | controle |
| `p-remar-energie` | Chaufferie | Chaudière | controle |
| `p-remar-energie` | Chaufferie | Brûleur | controle |
| `p-remar-energie` | Chaufferie | Condensation | controle |
| `p-remar-energie` | Chaufferie | Consignes / programmes | controle |
| `p-remar-energie` | Chaufferie | Vannes 3 voies | controle |
| `p-remar-cta` | Informations techniques | Désignation CTA | champ |
| `p-remar-cta` | Informations techniques | Année CTA | champ |
| `p-remar-cta` | Informations techniques | Type traitement d'air | champ |
| `p-remar-cta` | Informations techniques | Type de batterie | champ |
| `p-remar-cta` | Informations techniques | Contrôle d'humidité | champ |
| `p-remar-cta` | Informations techniques | Récupération d'énergie | champ |
| `p-remar-cta` | Informations techniques | Raccordement GTC | champ |
| `p-remar-cta` | Informations techniques | Exploitant - marché | champ |
| `p-remar-cta` | Avis sur l’entretien général | Eclairage du caisson | controle |
| `p-remar-cta` | Avis sur l’entretien général | Date du dernier remplacement de filtre | controle |
| `p-remar-cta` | Avis sur l’entretien général | Date de la dernière qualification | controle |
| `p-remar-cta` | Avis sur l’entretien général | Nettoyage des gaines horizontal & vertical | controle |
| `p-remar-cta` | Avis sur l’entretien général | Calorifugeage | controle |
| `p-remar-filtres` | Filtre n°1 | Type de filtre | champ |
| `p-remar-filtres` | Filtre n°1 | Etat du filtre | controle |
| `p-remar-filtres` | Filtre n°2 | Type de filtre | champ |
| `p-remar-filtres` | Filtre n°2 | Etat du filtre | controle |
| `p-remar-filtres` | Filtre n°3 | Type de filtre | champ |
| `p-remar-filtres` | Filtre n°3 | Etat du filtre | controle |
| `p-remar-cta-mesures` | Températures | Air neuf | champ |
| `p-remar-cta-mesures` | Températures | Après récupération | champ |
| `p-remar-cta-mesures` | Températures | Soufflage | champ |
| `p-remar-cta-mesures` | Températures | Extraction / Reprise | champ |
| `p-remar-cta-mesures` | Variation de vitesse | Soufflage | champ |
| `p-remar-cta-mesures` | Variation de vitesse | Extraction / Reprise | champ |
| `p-remar-cta-mesures` | Consignes | Soufflage | champ |
| `p-remar-cta-mesures` | Consignes | Extraction / Reprise | champ |
| `p-remar-cta-mesures` | Consignes | Pression | champ |
| `p-remar-cta-energie` | CTA | GTB | controle |
| `p-remar-cta-energie` | CTA | Variateur | controle |
| `p-remar-cta-energie` | CTA | Efficacité du récupérateur | controle |
| `p-remar-cta-energie` | CTA | Efficacité des moteurs | controle |
| `p-remar-cta-energie` | CTA | Consignes / programmes | controle |
| `p-remar-cta-energie` | CTA | Vannes de régulation | controle |
| `p-remar-vmc` | Informations générales | Type de ventilation | champ |
| `p-remar-vmc` | Informations générales | Nombre de caissons | champ |
| `p-remar-vmc` | Informations générales | Type de bouche | champ |
| `p-remar-vmc` | Situation | Situation du caisson | controle |
| `p-remar-vmc` | Situation | Accès au caisson | controle |
| `p-remar-vmc` | Situation | Garde-corps / ligne de vie | controle |
| `p-remar-vmc` | Caisson | Etat du caisson | controle |
| `p-remar-vmc` | Caisson | Fonctionnement | controle |
| `p-remar-vmc` | Caisson | Nettoyage caisson | controle |
| `p-remar-vmc` | Caisson | Etat courroie | controle |
| `p-remar-vmc` | Caisson | Coupure électrique | controle |
| `p-remar-vmc` | Distribution | Etat manchette | controle |
| `p-remar-vmc` | Distribution | Etat extérieur traînasse | controle |
| `p-remar-vmc` | Distribution | Etanchéité traînasse | controle |
| `p-remar-vmc` | Distribution | Nettoyage traînasse | controle |
| `p-remar-vmc` | Distribution | Pied de soutien | controle |
| `p-remar-vmc` | Distribution | Registre | controle |
| `p-remar-vmc` | Distribution | Trappe de visite | controle |
| `p-remar-vmc` | Distribution | Chapeau | controle |
| `p-remar-vmc` | Distribution | Nettoyage colonne | controle |
| `p-remar-vmc` | Gestion | Télégestion | controle |
| `p-remar-vmc` | Gestion | Pressostat | controle |
| `p-remar-froid` | Informations du site | Production froid | champ |
| `p-remar-froid` | Informations du site | Type de régulation | champ |
| `p-remar-froid` | Informations du site | Situation | champ |
| `p-remar-froid` | Informations du site | Accessibilité | champ |
| `p-remar-froid` | Informations du site | Support anti-vibratile | champ |
| `p-remar-froid` | Informations du site | Traitement acoustique | champ |
| `p-remar-froid` | Réseaux | Volume tampon | champ |
| `p-remar-froid` | Réseaux | Réseau 1 | champ |
| `p-remar-froid` | Réseaux | Réseau 2 | champ |
| `p-remar-froid` | Réseaux | Réseau 3 | champ |

## Livrables de recette
- Catalogue réel partiellement recopié dans `.github/fixtures/remar_classique_16_frozen_20261102.json` (69 critères complets, dernière ligne volontairement notée tronquée).
- `.github/scripts/test_remar_141_intranet_matrix.js` vérifie maintenant les correspondances avec cette référence réelle, et les conflits de noms réseau.
- Toute proposition de « GO » doit justifier zéro valeur perdue, zéro doublon matériel et conservation du rattachement photo d'origine.
