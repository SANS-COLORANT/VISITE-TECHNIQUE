# Réseau de chaleur — correspondance Intranet des synthèses

## Anomalie terrain, 28 octobre 2026
La validation locale bloquait l'envoi avec dix critères tels que :
`Critère « P2 » [REMARQUES SUR LE PRIMAIRE > Opération à effectuer] : aucun champ METRA correspondant de façon sûre.`

Ce sont les synthèses de réserves du modèle Excel Réseau de chaleur (lignes Primaire 362–366 et Secondaire 373–377), et **pas** des champs du formulaire de contrôle. Leur mapping par recherche de champ ne pouvait pas réussir.

## Règle de correction
Le sérialiseur Intranet reconnait **uniquement** le chemin explicite suivant :
- Catégorie : `REMARQUES SUR LE PRIMAIRE` ou `REMARQUES SUR LE SECONDAIRE` ;
- Sous-catégorie : `Opération à effectuer` ;
- Critère : `P2`, `P3`, `Conformité`, `Amélioration`, `Remarque` (ou `Remarques`) ;
- Trame locale : un modèle dont la définition comporte `excel.heatNetwork.summaryRows`.

Chaque cellule contient les prestations des réserves **de la visite courante seulement**, du périmètre et de la catégorie correspondants, ordonnées comme dans l'Excel, séparées par deux retours à la ligne. Cellule vide : `Sans Objet.` Avis `N.S` ou `S.O` uniquement si le serveur a déclaré `avisApplicable`. Aucune réserve n'est ajoutée, modifiée ou supprimée.

Les réserves explicitement classées Primaire/Secondaire alimentent les dix synthèses. Une réserve ancienne ou générale sans périmètre ne doit jamais se voir attribuer artificiellement Primaire ou Secondaire : elle reste entièrement envoyée dans `visites[].remarques[]` et exportée dans la feuille détaillée `REMARQUES`. Elle est simplement absente des synthèses de périmètre, comme dans l'Excel. Un périmètre peut toujours être choisi manuellement dans la fiche de réserve, sans modification automatique des données historiques. Les erreurs serveur, critères inconnus, champs obligatoires absents, matériels non classés et commentaires groupés supérieurs à 1 500 caractères restent bloquants.

## Précautions et recette
- Aucun changement SQLite, photos, export Excel, sécurité de rattachement Client/Site/Local ou autres trames.
- Vérifier les dix critères avec et sans réserves, les cinq catégories, les deux périmètres, l'ordre des prestations et `avisApplicable` vrai/faux.
- Vérifier qu'un critère inconnu et les visites ICPE restent bloqués.
- Exécuter `node .github/scripts/test_intranet_capability_mapping.js`, `npm run verify:metra` et le workflow APK natif complet.
- Recette physique restant nécessaire : la visite Les Ulis sur tablette, un envoi Intranet réel authentifié et la comparaison avec l'Excel de la même visite.
- Ne jamais désinstaller l'application ni écraser les données existantes pour appliquer ce correctif. Le build doit préserver la signature, le package Android et une version supérieure.

## Durcissement de la correspondance sémantique (28 octobre 2026)

Les libellés de critères serveur ne sont pas obligatoirement identiques aux
titres Excel. Le moteur prend maintenant en charge, **uniquement dans une
branche de synthèse RCU explicitement déclarée** par le modèle, les variantes
homologuées des cinq catégories P2, P3, Conformité, Amélioration et Remarque,
dont « Remarque particulière » / « Remarques particulières », au primaire et
au secondaire. Cette règle vaut pour tous les groupes de synthèse présents et
non pour deux cellules codées individuellement. Les variantes de casse et
d'accents sont normalisées.

Un nouveau critère inconnu, une branche hors périmètre ou deux critères
pointant vers la même synthèse restent bloqués (fail-closed). Tests : 10
synthèses, variantes, pluriels, doublons et trame non RCU.

L'alerte terrain « 15 lignes de matériel de référence absentes ou modifiées »
est **indépendante** des critères. L'API Symfony V1 supprime/recrée le
ListingMateriel entier. L'APK ne peut donc pas lever cette barrière sans
validation du serveur. Un correctif limité à l'écriture de la marque depuis
le catalogue est sûr uniquement quand les 9 autres propriétés sont
rigoureusement identiques; les véritables changements matériels restent
bloqués. Voir le contrat V2 et le diagnostic de remise au développeur.

## A2 : incident de transmission MÉTRA → Intranet — 28 octobre 2026

L'Excel exporté depuis Symfony est un **témoin aval**. L'absence d'avis et de
commentaires ne prouve pas une erreur de génération XLSX. Le sérialiseur MÉTRA
recherchait les codes de rubriques calculés depuis les libellés d'interface
(ex. `releves.temp_ratures_et_ph`, `regulation.r_seau_ecs`) au lieu des
codes réellement écrits par les panneaux spécialisés dans SQLite :

- `releves.temperatures` : huit contrôles pH/températures, avis + commentaires ;
- `releves.compteurs` : pressions ;
- `regulation.cascade` : cascade et températures associées ;
- `regulation.reseau_ecs` : consigne et cycle anti-légionellose.

Ce contrat de stockage est maintenant partagé par le sérialiseur des panneaux
ICPE et RCU, par groupe de champs (pas par cellule Excel). Les anciens slugs
restent lisibles en repli ; deux valeurs divergentes pour un même champ sont
refusées avant POST plutôt que remplacées arbitrairement. Les tests reproduisent
les 8 contrôles et 6 champs d'A2 et vérifient leurs avis/valeurs exacts.

L'envoi V1 protégeait les matériels *absents*, mais autorisait des répétitions
d'anciennes lignes. Une liste de 28 références présentes et répétées pour
atteindre 81 lignes pouvait passer le contrôle « aucune référence manquante ».
La prévalidation vérifie désormais aussi la **multiplicité** des signatures :
les répétitions en excédent, même si seule la casse de marque varie, bloquent
l'envoi. L'ajout d'un matériel réellement distinct demeure autorisé.

**Ne jamais supprimer les doublons en SQLite ou dans Symfony sans rapprochement
par identifiants d'origine.** Dans la sauvegarde fusionnée des 6–7 octobre, des
identifiants matériels externes se retrouvent sur plusieurs équipements locaux.
Le serveur actuel remplace intégralement son ListingMateriel : une réparation
de ses 81 lignes ne doit pas être tentée à l'aveugle. Le POST effectivement
envoyé et un GET de la visite Symfony sont nécessaires pour attribuer chaque
duplication, y compris celles déjà visibles dans MÉTRA avant le POST.
