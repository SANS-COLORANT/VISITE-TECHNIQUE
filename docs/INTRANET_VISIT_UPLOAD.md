# METRA → Intranet — envoi des visites

## Contrat serveur implémenté

METRA envoie une visite finalisée vers :

`POST /api/clients/{idclient}/visites`

Le corps JSON est figé au moment de la mise en file et contient uniquement
`envoiId` et `visites`. Chaque visite contient exactement : `localId`,
`trameId`, `derniereVisiteIdSource`, `date`, `statut`, `criteres`, `remarques`,
`materiels`, `notes`.

Les photos restent volontairement exclues de ce JSON, car le serveur les reçoit
séparément après la création de la visite. Une fois l'identifiant Symfony de la
visite confirmé, METRA envoie chaque image vers :

`POST /api/clients/{idclient}/visites/{idvisite}/photos`

La conclusion reste hors synchronisation tant qu'aucun contrat serveur dédié ne
la définit.

## Envoi des photos de visite

La réponse du POST de visite fournit l'identifiant Symfony de la visite créée.
METRA le conserve dans `api_visit_outbox.remote_visit_id`, puis construit une
file photo persistante `api_visit_photo_outbox`.

Chaque photographie est envoyée seule en `multipart/form-data` avec :

- `fichier` : JPEG, PNG, GIF ou WebP, 10 Mio maximum ;
- `envoiPhotoId` : UUID v4 créé une seule fois et conservé à travers les retries ;
- `description` : libellé METRA, limité à 255 caractères ;
- `ordre` : entier positif et unique dans la visite ;
- `grandFormat` : `true` ou `false` ;
- `categorieId`, `sousCategorieId`, `critereId` uniquement lorsqu'un
  rattachement unique et sûr au critère Intranet est disponible.

Pour une photo générale ou une photo dont le rattachement à un critère n'est
pas unique, les trois identifiants de critère sont entièrement omis. METRA ne
les envoie jamais vides ou à `null`.

Les photos prises sur une conformité utilisent le même mapping structurel que
les critères du POST de visite. Une photo rattachée localement à une réserve
issue d'un contrôle est d'abord remontée vers `remarques.controle_key`, puis
rattachée au triplet Intranet seulement si ce triplet est univoque. Les photos
d'équipement, réseau, compteur ou générales qui n'ont pas de triplet serveur
certain sont envoyées comme photos générales de la visite plutôt que d'inventer
une liaison.

Pour éviter qu'une visite comportant beaucoup de photographies surcharge
l'Intranet, METRA découpe automatiquement l'export en **lots de 10 photos**.
Un seul lot est traité à la fois, avec au maximum trois transferts simultanés à
l'intérieur de ce lot. Le premier lot part immédiatement après la création de
la visite ; les lots suivants reprennent automatiquement toutes les 15 secondes
tant que METRA reste au premier plan. Si l'application est fermée ou que le
réseau disparaît, la file SQLite conserve exactement les photos déjà confirmées
et celles restant à envoyer. Au prochain passage, METRA reprend le lot suivant
sans recréer la visite Symfony et sans changer les `envoiPhotoId` déjà attribués.

Chaque tentative HTTP reçoit une nouvelle preuve DPoP ; l'`envoiPhotoId`, le
fichier et les métadonnées restent stables pour permettre le rejeu idempotent.
Un HTTP 201 ou un HTTP 200 avec `rejoue: true` marque la photo comme synchronisée.

Le bouton de la visite ne passe **Online** que lorsque la visite elle-même et
toutes ses photos locales sont confirmées par l'Intranet. Si la visite a été
créée mais que des photos restent à envoyer, le statut demeure **Offline** et
l'interface affiche la progression `photos x/y · envoi par lots de 10`. Les
lots suivants reprennent automatiquement ; un nouvel appui sur Offline permet
aussi de relancer immédiatement le prochain lot sans recréer la visite.

## Liaison au client importé

Le client Intranet devient une propriété de rattachement du client METRA au
moment où le client/site est matérialisé depuis l'annuaire Intranet. Une visite
créée ensuite dans ce client METRA ne peut être renvoyée que vers ce même client
Intranet.

METRA ne propose plus de sélecteur permettant de choisir un autre client au
moment de l'envoi. Le site est résolu uniquement à partir de la liaison du site
METRA avec ce client importé. Le local est repris depuis la liaison de la visite
ou de l'installation ; si cette liaison n'existe pas, METRA ne choisit un local
automatiquement que lorsqu'un seul local compatible est possible. Toute
ambiguïté bloque l'envoi au lieu de deviner une destination.

Si la préparation locale est obsolète ou incomplète, METRA tente d'actualiser
`GET /api/clients/{idclient}/preparation-visites` pour ce même client importé,
puis retente la résolution. Il ne bascule jamais vers un autre client autorisé
sur la tablette.

## Offline-first et idempotence

- Une visite non exportée affiche **Offline** en noir.
- Un appui sur **Offline** prépare et envoie directement la visite vers son
  client Intranet importé ; aucun choix de client n'est demandé.
- Après création de la visite serveur, les photos sont mises en file et envoyées
  séparément ; une panne sur une image ne renvoie pas toute la visite.
- Les gros ensembles sont découpés en lots de 10 photos maximum ; chaque lot
  reprend sur l'état persistant du lot précédent.
- Après accusé serveur valide de la visite et de toutes les photos locales,
  l'état devient **Online** en vert.
- Une visite historique importée depuis l'Intranet est affichée **Online** car
  elle existe déjà côté serveur, mais elle ne peut pas être recréée comme une
  nouvelle visite.
- Android génère un UUID v4 `envoiId` pour la visite et un UUID v4
  `envoiPhotoId` pour chaque photo via le module natif DPoP.
- Le JSON de visite et les identifiants d'idempotence sont persistés dans SQLite.
- Une coupure réseau, un HTTP 5xx ou un 429 conserve les files. La tentative
  suivante réutilise les mêmes identifiants métier mais crée une nouvelle preuve
  DPoP.
- Une ligne restée `sending` après arrêt du processus passe en `retry` au
  redémarrage.
- Les visites sont envoyées séquentiellement. Dans chaque lot de photos, trois
  transferts au maximum sont simultanés ; le lot suivant est traité séparément.

Les files sont persistantes ; leur traitement automatique est opportuniste
lorsque METRA est au premier plan. Aucun service Android permanent n'est promis
lorsque le système arrête réellement le processus.

## Conflits et erreurs

Pour la visite :

- `401` : la couche DPoP peut renouveler une seule fois le jeton. Si l'échec
  persiste, la ligne passe en `auth_error`.
- `409 synchronization_conflict` : état `conflict`, jamais relancé
  automatiquement. Une nouvelle préparation du même client Intranet est
  nécessaire.
- `409 idempotency_conflict` : terminal.
- `422` : les violations serveur sont conservées dans SQLite et affichables.
- `400`, `404`, `413`, `415` : rejet terminal ; aucune boucle automatique.
- Accusé `2xx` incohérent : rejet terminal local, sans nouvel `envoiId`.
- `429` : `Retry-After` pilote la prochaine tentative.
- erreur réseau / `500`, `502`, `503`, `504` : nouvelle tentative différée.

Pour une photo, les mêmes règles d'authentification et de reprise s'appliquent.
Les `409`, `413`, `415` et `422` sont conservés comme erreurs à corriger ; un
`429` respecte `Retry-After`; une erreur réseau ou un `5xx` est retenté avec le
même `envoiPhotoId` et une nouvelle preuve DPoP.

## Construction des critères

La référence de trame Intranet est figée sur la visite avant l'envoi. L'envoi
parcourt toutes les catégories, sous-catégories et critères de cette référence
et produit exactement une ligne par critère. Un mapping ambigu ou absent bloque
l'envoi avant HTTP.

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

Si la référence Intranet comportait du matériel et que le tableau courant en
contient moins, l'utilisateur doit confirmer explicitement le remplacement du
listing avant la mise en file. Cette protection évite une suppression
accidentelle du patrimoine distant.

Les états acceptés côté serveur sont `Hors service`, `Vétuste`, `Moyen`, `Bon`,
`Neuf` ou `null`. Les états METRA historiques supplémentaires restent utilisables
localement, mais bloquent l'envoi tant qu'ils n'ont pas été adaptés explicitement.