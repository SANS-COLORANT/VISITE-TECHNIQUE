# METRA → Intranet — envoi des visites

## Contrat serveur implémenté

METRA envoie une visite finalisée vers :

`POST /api/clients/{idclient}/visites`

Le corps JSON est figé au moment de la mise en file et contient uniquement
`envoiId` et `visites`. Chaque visite contient exactement : `localId`,
`trameId`, `derniereVisiteIdSource`, `date`, `statut`, `criteres`, `remarques`,
`materiels`, `notes`.

Les photos et la conclusion ne sont pas envoyées par cette route : le contrat
serveur fourni les exclut explicitement et ne définit pas encore leur flux.

## Offline-first et idempotence

- L'utilisateur finalise la visite puis choisit **Préparer et envoyer**.
- METRA valide tout le JSON avant d'écrire la file d'attente.
- Android génère alors un UUID v4 `envoiId` via le module natif DPoP.
- Le JSON sérialisé et cet UUID sont enregistrés dans SQLite et ne sont plus
  reconstruits pour une tentative réseau.
- Une coupure réseau, un HTTP 5xx ou un 429 conserve cet envoi. La tentative
  suivante renvoie exactement le même JSON et le même `envoiId`, mais
  `symfonyApi.js` crée une nouvelle preuve DPoP à chaque requête HTTP.
- Une ligne restée `sending` après arrêt du processus passe en `retry` au
  redémarrage. L'accusé 200 rejoué est traité comme un succès sans doublon.
- La file est traitée séquentiellement, jusqu'à trois visites par réveil, pour
  rester nettement sous la limite serveur de dix envois par minute.

La file est persistante ; son traitement automatique est opportuniste lorsque
METRA est au premier plan. Aucun service Android permanent n'est promis lorsque
le système arrête réellement le processus.

## Conflits et erreurs

- `401` : la couche DPoP peut renouveler une seule fois le jeton. Si l'échec
  persiste, la ligne passe en `auth_error`.
- `409 synchronization_conflict` : état `conflict`, jamais relancé
  automatiquement. Une nouvelle préparation Intranet est nécessaire.
- `409 idempotency_conflict` : également terminal.
- `422` : les violations serveur sont conservées dans SQLite et affichables.
- `400`, `404`, `413`, `415` : rejet terminal ; aucune boucle automatique.
- Accusé `2xx` incohérent (envoiId, `rejoue`, index, visite ou local) : rejet
  terminal local. METRA ne génère surtout pas un nouvel `envoiId`, car la visite
  peut déjà avoir été créée côté serveur.
- `429` : `Retry-After` pilote la prochaine tentative.
- erreur réseau / `500`, `502`, `503`, `504` : nouvelle tentative différée.

## Construction des critères

La référence de trame Intranet est figée sur la visite au moment de sa création
depuis la préparation. L'envoi parcourt toutes les catégories,
sous-catégories et critères de cette référence et produit exactement une ligne
par critère. Un mapping ambigu ou absent bloque l'envoi avant HTTP.

- Contrôle applicable : avis courant METRA parmi `S.O`, `S`, `N.S`, `N.R`,
  `N.V` + commentaire courant ; commentaire vide envoyé sous `/`.
- Critère sans avis : `avis: null` + valeur courante dans `commentaire`, ou `/`.
- Réseaux ICPE : les valeurs sont relues dans la table `reseaux`. L'identité
  catégorie/sous-catégorie Intranet est conservée dans la provenance lors du
  report vers la nouvelle visite. Les branches Intranet sans réseau local sont
  tout de même envoyées avec `/`; un réseau local impossible à rattacher sans
  ambiguïté bloque l'envoi plutôt que d'être placé au hasard.
- Index compteurs ICPE : la valeur est relue dans `compteurs`, et non dans un
  ancien champ de préremplissage.
- Pré-allumage : les rubriques dynamiques de la visite complètent les candidats
  de la trame officielle. Une visite Pré-allumage contenant plusieurs locaux
  METRA est bloquée pour l'envoi tant que l'API ne fournit pas un mapping
  explicite local METRA → local Intranet ; aucun rapprochement par nom n'est inventé.

Une visite historique importée depuis Symfony est explicitement interdite à
l'envoi afin qu'elle ne soit jamais recréée comme nouvelle visite serveur.

## Remarques / réserves

Le `delai` historique de METRA reste un nombre de mois. Le contrat Symfony
attend une date. La migration 033 ajoute donc trois champs séparés :

- `intranet_date_reserve` — date de réserve ; à défaut, date réelle de création
  locale de la réserve ;
- `intranet_delai` — échéance `YYYY-MM-DD` ou `null` ;
- `intranet_etat_avancement` — valeur de l'énumération serveur ou `null`.

L'interface Réserves les expose uniquement pour les visites réellement liées à
l'Intranet, sans encombrer les visites purement locales et sans réinterpréter
silencieusement le délai en mois existant.

## Matériel

Le serveur remplace entièrement son `listing_materiel` avec le tableau reçu.
METRA envoie donc toutes les lignes `materiel` de la visite, pas seulement les
modifications.

Si la référence Intranet comportait au moins un matériel et que le tableau
courant est vide, l'utilisateur doit confirmer explicitement **Confirmer le
listing vide** avant la mise en file. Cette protection empêche une suppression
accidentelle du patrimoine distant.

Les états acceptés côté serveur sont `Hors service`, `Vétuste`, `Moyen`, `Bon`,
`Neuf` ou `null`. Les états METRA historiques supplémentaires restent utilisables
localement, mais bloquent l'envoi tant qu'ils n'ont pas été adaptés explicitement.

## États visibles

- Prête à envoyer
- En attente d'envoi
- Envoi vers l'Intranet
- En attente de connexion / nouvelle tentative
- Synchronisée avec l'Intranet
- Conflit de synchronisation
- Données refusées à corriger
- Connexion Intranet à réactiver

La liste des visites affiche aussi si une visite rattachée à l'Intranet est non
envoyée, à suivre ou synchronisée.


## Envoi de n’importe quelle visite METRA

Une visite n’a plus besoin d’avoir été créée depuis le bouton « Préparer » de l’annuaire Intranet pour être synchronisable.

Le bloc **Synchronisation Intranet** reste visible sur toute visite METRA non historique. Si la visite ne possède pas encore d’identifiants serveur, l’utilisateur choisit explicitement :

1. le client Intranet autorisé sur la tablette ;
2. le site de ce client ;
3. le local / l’installation du site compatible avec la trame de la visite.

METRA propose automatiquement les correspondances déjà connues pour le client, le site, l’installation ou la trame, mais ne fabrique jamais un `localId`. L’utilisateur peut actualiser `GET /api/clients` puis `GET /api/clients/{idclient}/preparation-visites` depuis le sélecteur avant de confirmer.

L’association fige sur la visite les identifiants `api_remote_client_id`, `api_remote_local_id`, `api_remote_trame_id` et `api_source_remote_visit_id`, ainsi qu’une copie de la référence de préparation utilisée. Elle ne copie aucune ancienne réserve ou conclusion dans la visite du jour.

Le POST serveur actuel ne reçoit pas de `siteId` ni de nom de client/site : il exige l’identifiant du client dans l’URL et un `localId` dans chaque visite. En conséquence, un client réellement absent/non autorisé est signalé par le serveur en HTTP 404 ; un local, une trame ou une association incorrecte est normalement signalé en HTTP 422. METRA affiche désormais explicitement le code HTTP et le message/violation renvoyés par l’Intranet.
