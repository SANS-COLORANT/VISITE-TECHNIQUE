# Intranet — schéma SQL serveur observé le 14/09/2026

Source analysée : dump phpMyAdmin MySQL 8.4.7 `energieetservice`, généré le 14/09/2026 à 15:16. Le fichier fourni contient le schéma et les contraintes, sans lignes `INSERT INTO` ; ce document ne prétend donc pas décrire les données réelles présentes en production.

## Relations structurantes pour METRA

- `client` contient notamment `nom`, `categorie`, `code_everwin`, `adresse_postale`, `ville`, `logo_client` et l'agence E&S.
- `site` n'a pas de `client_id`. La relation client ↔ site passe par `lot` puis `site_lot`. Un même site physique peut donc être exposé depuis plusieurs relations client/lot. METRA doit conserver son modèle `api_client_site_links` et ne jamais réintroduire une propriété unique client → site côté serveur.
- `local` appartient à `site` et porte `type_trame_id`, `type`, `situation`, `periodicite_visite`, `derniere_visite`, `prochaine_visite`, `designation`, `visite_planifiee` et `ordre`.
- `visite_technique` cible exactement un `local_id` et un `type_trame_id`. Une visite serveur n'est donc pas multi-local.
- `local_critere` relie une visite à `criteres_trame`, `categorie_trame` et `sous_categorie`; `commentaire` est obligatoire et limité à 1500 caractères, `avis` est nullable.
- l'ordre de la trame est porté par `ordre_categorie`, `ordre_sous_categorie` et `ordre_critere`.

## Photos de visite

`photographie` contient :

- `visite_technique_id` obligatoire ;
- `path` varchar(255) obligatoire ;
- `description` varchar(255) nullable ;
- `grand_format` booléen obligatoire ;
- `ordre` entier obligatoire ;
- `local_critere_id` nullable.

Conséquence : une photo générale de visite est valide sans `local_critere_id`. METRA ne doit envoyer le triplet catégorie / sous-catégorie / critère que lorsqu'il dispose d'un rattachement certain.

`envoi_photo_tablette_api` conserve `tablette_id`, `visite_id`, `envoi_id`, `payload_hash` et `reponse`; l'unicité est `(tablette_id, envoi_id)`. Cela confirme le principe d'un `envoiPhotoId` stable pour les reprises idempotentes.

`envoi_visite_tablette_api` applique la même logique d'idempotence à l'envoi de visite avec l'unicité `(tablette_id, envoi_id)`.

## Compteurs

La table serveur `compteur` contient uniquement un identifiant et un `nom`. Sa relation SQL visible est `conso_compteur` vers `conso`; aucune clé étrangère ne relie `compteur` à `visite_technique` ou `local_critere`.

Conséquence pour l'envoi d'une visite : l'absence d'une information compteur dans METRA ne doit pas invalider le POST de visite. Pour un critère de relevé sans valeur, METRA envoie la valeur vide contractuelle `/`. Une ambiguïté réelle entre plusieurs compteurs locaux de même libellé reste signalée plutôt que de choisir arbitrairement.

## Patrimoine et informations à conserver offline

Le cache METRA doit conserver, lorsqu'ils sont exposés par l'API :

- le chemin `client.logo_client` comme métadonnée distante ; il reste distinct de `clients.image_uri`, qui est la photo locale/offline choisie dans METRA ;
- l'adresse et les métadonnées de `site` : `site_principal`, `adresse`, `code_postal`, `ville`, `code_exploitant`, `surface_batiment`, `date_batiment`, `nombre_logements`, `date_ajout`, `date_supression`, `code`, `energie`, `type_batiment`, `type_marche`, `service`, `agence` ;
- les métadonnées de `local` : `type`, `situation`, `periodicite_visite`, `prochaine_visite`, `visite_planifiee`, `ordre`, `type_trame_id`.

L'ordre serveur des locaux doit être respecté dans les listes offline ; l'ordre alphabétique ne doit être qu'un fallback.

Lors de la matérialisation d'un client ou site déjà existant localement, les valeurs Intranet peuvent compléter les champs locaux encore vides mais ne doivent pas écraser une saisie terrain existante.

## Autres tables utiles au contrat visite

- `listing_materiel` confirme les longueurs actuellement validées par METRA : `nombre`, `categorie`, `designation`, `numero_materiel`, `reseau_desservi`, `marque`, `modele`, `caracteristiques` en varchar(255), `annee` en varchar(128), `etat` en varchar(25).
- `remarque_visite` confirme `poste` 50, `prestation` 765, `date_reserve` obligatoire, `delai` date nullable, `etat_avancement` 100, `estimatif` 128.
- `note.contenu` est limité à 1000 caractères.
- `conclusion` existe bien côté base et est unique par `visite_technique`, mais ce dump SQL ne définit aucune route API ni aucun format d'écriture de conclusion. METRA continue donc de ne pas inventer un endpoint de conclusion tant que le contrat HTTP correspondant n'est pas fourni.

## Point image client / site

Le serveur possède `client.logo_client`, mais aucune colonne équivalente d'image n'est présente dans la table `site` du dump. Les images client/site ajoutées dans METRA restent donc offline/locales par défaut. Le logo client distant est conservé comme métadonnée lorsqu'il est fourni par l'API, sans supposer qu'il est directement téléchargeable par la tablette.
