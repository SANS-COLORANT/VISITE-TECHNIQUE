# ÉTAT DU PROJET — DEUX VERSIONS DE METRA VISITE TECHNIQUE

Ce dépôt contient la version **"classique"** de METRA Visite Technique : une
application autonome et volontairement simple (une quinzaine de fichiers),
sans backend, avec une navigation maison et un modèle SQLite direct
(`champs_visite`/`controles_visite`). C'est la base historique du produit.

Il existe par ailleurs, sur la branche distante
`feat/metra-phone-companion-cross-device` (non fusionnée ici), une version
**"Missions / Companion / Intranet"** beaucoup plus large (~200 fichiers) :
modules Missions, synchronisation avec un backend Symfony, mode Companion
téléphone↔tablette, modules natifs Android (OCR, géolocalisation de
patrimoine, signature électronique, PDF), et un schéma SQLite étendu à 44
migrations. C'est cette branche qui produit les builds APK numérotés côté
EAS (ex. build #615).

**Avant de démarrer une tâche sur ce dépôt**, vérifie sur quelle branche/quel
état du produit elle porte : un correctif fait ici (branche
`claude/gallant-ramanujan-v4hg3s` ou équivalente "classique") ne s'applique
pas automatiquement à la version Missions/Companion, et inversement. Les
deux bases ont divergé sur des points structurels (schéma DB, navigation,
présence ou non d'un backend) — ne pas supposer qu'un fichier du même nom
a le même contenu des deux côtés.

# CONTEXT7 — POLITIQUE METRA

Context7 doit être utilisé uniquement comme source documentaire ponctuelle.

## OBJECTIF

Obtenir une documentation récente et correspondant à la version réellement utilisée
d'une dépendance lorsque cela est nécessaire pour éviter une API obsolète,
une mauvaise syntaxe ou une implémentation incorrecte.

## UTILISER CONTEXT7 UNIQUEMENT SI

- une API externe est incertaine ;
- la syntaxe dépend de la version installée ;
- une méthode semble obsolète ou deprecated ;
- une erreur de compilation semble liée à une dépendance ;
- une implémentation repose sur une bibliothèque tierce mal connue ;
- la documentation actuelle est réellement nécessaire pour décider de la correction.

## NE PAS UTILISER CONTEXT7 POUR

- comprendre l'architecture interne de METRA ;
- rechercher du code déjà présent dans le dépôt ;
- les modifications UI simples ;
- les renommages ;
- les textes ;
- les refactors évidents ;
- les fonctions internes METRA ;
- une API dont l'usage correct est déjà visible dans le dépôt ;
- vérifier plusieurs fois la même information.

## MÉTHODE

1. Identifier d'abord la dépendance ET sa version depuis le projet.
2. Chercher dans le code existant si METRA utilise déjà cette API correctement.
3. Utiliser Context7 seulement si une incertitude subsiste.
4. Faire une requête très ciblée.
5. Demander uniquement la partie de documentation nécessaire.
6. Ne pas charger la documentation complète d'une bibliothèque.
7. Ne pas recopier de longues portions de documentation dans le contexte.
8. Résumer mentalement l'information utile et poursuivre le travail.
9. Réutiliser l'information déjà récupérée pendant la tâche au lieu d'interroger Context7 à nouveau.

## BUDGET

- maximum 5 consultations Context7 par tâche par défaut ;
- une seule consultation si elle suffit ;
- si plus de 5 sont réellement nécessaires, arrêter et expliquer pourquoi avant de continuer.

## IMPORTANT

Context7 est un outil de vérification, pas la source principale de compréhension du projet.

Priorité :

1. Code METRA
2. Tests / build / logs
3. Documentation déjà présente dans le dépôt
4. Context7 si nécessaire

Ne jamais effectuer une requête Context7 générale du type :
"explique-moi cette bibliothèque".

Préférer :
"Version X.Y : comportement de [fonction précise] concernant [problème précis]."

Lorsqu'un ID Context7 de bibliothèque a déjà été résolu pendant la tâche,
le réutiliser directement sans refaire la résolution.
