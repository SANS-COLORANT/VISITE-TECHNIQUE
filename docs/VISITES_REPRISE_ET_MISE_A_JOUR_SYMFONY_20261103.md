# METRA — Reprise intégrale des visites et corrections après envoi (03/11/2026)

## Réalisé côté METRA
- À la création, pour la même installation et la même trame : duplication **locale uniquement** des `champs_visite` (hors identité/date courante), `controles_visite` (`S`, `N.S`, `S.O`, `N.R`, `N.V` + commentaires), `remar_values` par CTA/filtre/caisson/compteur/température, et note libre. Copie idempotente et immédiate avant ouverture de la visite.
- Les mesures réseaux et compteurs continuent d'utiliser `carryForwardPreviousVisit`. Les réserves ouvertes suivent la gestion historique et les réserves levées ne sont pas réouvertes. Les photos antérieures restent accessibles depuis leurs visites et références, **non recréées comme preuve datée du jour** (évite la perte de fichier par partage d'URI et l'upload de faux clichés récents).
- Une réédition sur la tablette compare le payload calculé à l'original `api_visit_outbox.payload_json` de la visite reconnue par Symfony. Le statut passe visuellement **gris** si différence, données conservées. Aucun envoiId ni POST n'est recréé.
- L'envoi client affiche les **dernières visites terminées** par couple local / trame, sélectionnées par défaut, avec cases par site et local, et tout sélectionner/désélectionner. Le service n'envoie que les `visiteIds` choisis. Les files d'attente préexistantes restent traitées indépendamment.
- La trame **REMAR COMPLÈTE** est présélectionnée par son nom Symfony unique quand l'utilisateur sélectionne REMAR. Si plusieurs complètes ou aucune ne sont publiées, l'utilisateur doit choisir explicitement ; ne jamais rabattre silencieusement sur REMAR CLASSIQUE.
- La fenêtre de création ne contient plus l'encadré redondant « Chaufferie / Trame Intranet non renseignée ».

## Blocage serveur : modification d'une visite déjà publiée

Le contrat vérifié dans `symfonyApi.js` est uniquement `POST /api/clients/{clientId}/visites`.
Le serveur utilise `envoiId` comme **clé d'idempotence pour la création**. Réutiliser le même `envoiId` avec un payload différent provoque un conflit ; un nouvel `envoiId` risquerait de créer une **seconde visite**. Un re-POST n'est pas une mise à jour sûre.

Le bouton gris indique donc actuellement **des corrections locales non répercutées** ; le clic explique ce verrou au lieu de mentir sur une synchronisation réussie. Le besoin d'API suivant reste indispensable.

### Contrat Symfony à faire implémenter et documenter

1. **Route de mutation authentifiée DPoP** sur un `remote_visit_id` déjà reconnu par le POST, par exemple `PATCH /api/clients/{clientId}/visites/{remoteVisitId}` (URL à confirmer avec le développeur Symfony). **Ne pas coder le client sur une URL supposée.**
2. Identité figée : le client, site, local et trame doivent correspondre à ceux du POST initial. Aucun déplacement entre clients/locaux et aucune recréation.
3. Révision serveur `ETag/If-Match` ou version numérique, et identifiant idempotent **distinct par correction**. Rejouer le même correctif après interruption doit rendre le même ACK, sans créer de visite.
4. `PATCH` des critères par identifiants **(catégorie, sous-catégorie, critère)** et avis/commentaires, mêmes règles REMAR CLASSIQUE / COMPLÈTE et valeurs multilignes. Toute donnée saisie non représentable est refusée sans écrasement silencieux.
5. Retour avec `remoteVisitId` inchangé, nouvelle révision et tableau des critères acceptés, erreurs 409 explicites sur modification concurrente, validation 422 précise, 401/403/auth contrôlés. Support du statut de réserve si demandé, sans effacer de photos historiques.
6. Après la correction, METRA stockera l'ACK de cette révision et remplacera **seulement** le snapshot confirmé, jamais l'historique de la visite initiale. Tests obligatoires `POST -> PATCH -> GET`, double PATCH identique, 409, réseau coupé avant ACK, deux tablettes, photos, matériel, date et ID du même local. Sans ces résultats, **aucun GO de re-synchronisation d'une visite modifiée**.

**À ne pas confondre :** l'APK peut être validé pour les quatre autres demandes et pour l'indicateur gris, mais il ne saurait valider un flux Symfony PATCH qui n'existe pas encore dans le contrat fourni.
