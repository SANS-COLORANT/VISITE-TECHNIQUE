# METRA → Intranet — envoi des visites

## Contrat serveur implémenté

METRA envoie d'abord une visite finalisée vers :

`POST /api/clients/{idclient}/visites`

Le corps JSON est figé au moment de la mise en file et contient uniquement
`envoiId` et `visites`. Chaque visite contient exactement : `localId`,
`trameId`, `derniereVisiteIdSource`, `date`, `statut`, `criteres`, `remarques`,
`materiels`, `notes`.

Le JSON de visite reste strictement sans photo. Après l'accusé serveur de cette
première route, METRA récupère l'identifiant Symfony de la visite puis envoie
chaque photographie séparément vers :

`POST /api/clients/{idclient}/visites/{idvisite}/photos`

La conclusion reste hors du contrat d'envoi actuel.

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
- Une visite nouvellement créée ne passe **Online** qu'après confirmation du
  JSON de visite et de toutes ses photos locales.
- Une visite historique importée depuis l'Intranet est affichée **Online** car
  elle existe déjà côté serveur, mais elle ne peut pas être recréée comme une
  nouvelle visite sans modification métier.
- Android génère un UUID v4 `envoiId` pour la visite et un UUID v4
  `envoiPhotoId` distinct pour chaque photo.
- Le JSON sérialisé et son `envoiId` sont enregistrés dans SQLite et ne sont
  plus reconstruits pour une tentative réseau.
- Chaque photo est copiée dans une zone privée de file d'attente avant son
  premier envoi. Les nouvelles tentatives réutilisent exactement le même
  `envoiPhotoId`, les mêmes métadonnées et les mêmes octets.
- Une coupure réseau, un HTTP 5xx ou un 429 conserve les files. La tentative
  suivante utilise une nouvelle preuve DPoP mais les mêmes identifiants
  idempotents.
- Une ligne restée `sending` après arrêt du processus passe en `retry` au
  redémarrage.
- Les photos sont cadencées sous la limite serveur de 60 requêtes/minute et le
  traitement respecte `Retry-After` en cas de 429.

Les files sont persistantes ; leur traitement automatique est opportuniste
lorsque METRA est au premier plan. Aucun service Android permanent n'est promis
lorsque le système arrête réellement le processus.

## Envoi des photographies

La séquence est impérative :

1. envoi du JSON de visite ;
2. lecture de l'identifiant `id` renvoyé par Symfony pour cette visite ;
3. mise en file des photos locales ;
4. une requête multipart séparée par photographie.

Chaque requête photo utilise `multipart/form-data` généré par React Native. METRA
ne définit jamais lui-même l'en-tête `Content-Type`, afin de laisser React Native
produire le bon `boundary`.

Champs envoyés :

- `fichier` : JPEG, PNG, GIF ou WebP, 10 Mio maximum ;
- `envoiPhotoId` : UUID v4 durable de la photo ;
- `description` : libellé METRA, 255 caractères maximum, chaîne vide autorisée ;
- `ordre` : entier positif unique dans la visite, de 1 à 10000 ;
- `grandFormat` : `true` ou `false` ; METRA envoie actuellement `false` lorsque
  la photo locale ne possède pas d'information de mise en page dédiée ;
- `categorieId`, `sousCategorieId`, `critereId` : envoyés ensemble uniquement
  lorsque le rattachement au critère peut être résolu sans ambiguïté. Sinon la
  photo est transmise comme photo générale de la visite.

Une photo rattachée localement à une réserve `remarque||...` est d'abord ramenée
à son `controle_key`, puis le même référentiel de mapping de critère que le
payload de visite est utilisé. Les photographies de référence téléchargées
depuis les dernières visites Intranet sont stockées dans les tables
`api_latest_visit_photos` / `api_photo_files` et ne sont pas confondues avec les
photos terrain de la table `photos` : elles ne sont donc jamais réenvoyées.

L'outbox photo est indépendante de l'outbox visite. Une photo rejetée n'impose
pas de renvoyer le JSON complet ni les autres images déjà confirmées. Lorsqu'une
ancienne visite METRA avait déjà été synchronisée avant l'ajout de ce flux, le
runtime détecte ses photos locales non encore envoyées et les rattache à
l'identifiant de visite Symfony déjà connu.

## Conflits et erreurs

### Visite

- `401` : la couche DPoP peut renouveler une seule fois le jeton. Si l'échec
  persiste, la ligne passe en `auth_error`.
- `409 synchronization_conflict` : état `conflict`, jamais relancé
  automatiquement. Une nouvelle préparation du même client Intranet est
  nécessaire.
- `409 idempotency_conflict` : terminal.
- `422` : les violations serveur sont conservées dans SQLite et affichables.
- `400`, `404`, `413`, `415` : rejet terminal ; aucune boucle automatique.
- Accusé `2xx` incohérent : rejet terminal local. METRA ne génère pas un nouvel
  `envoiId`, car la visite peut déjà exister côté serveur.
- `429` : `Retry-After` pilote la prochaine tentative.
- erreur réseau / `500`, `502`, `503`, `504` : nouvelle tentative différée.

### Photos

- `401` : réauthentification DPoP selon le flux commun ; échec persistant en
  `auth_error` ;
- `404` : client/visite inaccessible ou incohérent, rejet terminal ;
- `409 idempotency_conflict` : terminal, aucun nouvel UUID automatique ;
- `413` : photo trop volumineuse, terminal ;
- `415` : format multipart ou média non accepté, terminal ;
- `422` : fichier, ordre, UUID ou rattachement au critère invalide, terminal ;
- `429` : reprise selon `Retry-After` ;
- erreur réseau / `500`, `502`, `503`, `504` : reprise différée avec le même
  `envoiPhotoId` et la même copie figée.

Le bouton reste **Offline** tant qu'une donnée métier ou une photo locale de la
version courante reste à envoyer/corriger. Il passe **Online** uniquement lorsque
les accusés nécessaires sont reçus.

## Construction des critères

La référence de trame Intranet est figée sur la visite avant l'envoi. L'envoi
parcourt toutes les catégories, sous-catégories et critères de cette référence
et produit exactement une ligne par critère. Un mapping ambigu ou absent bloque
l'envoi du JSON avant HTTP.

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
l'envoi inchangé afin qu'elle ne soit jamais recréée comme nouvelle visite
serveur.

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
