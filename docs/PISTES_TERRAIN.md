# Pistes terrain (octobre 2026)

Six améliorations validées sur maquette (https://claude.ai/artifact/WCG3i7Yq1uy2AcWbk3NjJr).
Aucune ne change un avis, une réserve ou un export : ce sont des aides de lecture et de saisie.

| Piste | Où | Code |
|---|---|---|
| « Ma journée » | Accueil, sous la recherche | `MaJourneeCard.js`, `journeeDb.js`, `journeeModel.js` |
| Relecture avant envoi | Bouton d'envoi Intranet d'une visite | `RelectureSheet.js`, `relectureModel.js`, `relectureDb.js`, prop `beforeSend` de `IntranetVisitSyncControl` |
| Réserve en trois gestes | Anomalie rapide de la visite | `motifsReserve.js` |
| Depuis la dernière visite | Tête de l'écran d'un local | `DepuisDerniereVisiteCard.js`, `depuisDerniereVisite.js`, `depuisDerniereVisiteDb.js` |
| Courbe des compteurs | Ligne de compteur de l'onglet Relevés | `CourbeReleves.js`, `releveHistorique.js`, `releveHistoriqueDb.js` |
| Recherche globale | Champ de recherche de l'accueil | `RechercheGlobaleResultats.js`, `rechercheGlobale.js`, `rechercheGlobaleDb.js` |

## Règles de conception

- **Ma journée** : itinéraire de tous les clients (voir `TOURNEE_CLIENT.md`), visites terminées non envoyées, réserves ouvertes. La carte disparaît quand il n'y a rien à suivre. Le bouton « Reprendre » ouvre le site du prochain élément à faire.
- **Relecture** : ne bloque jamais l'envoi (« Envoyer quand même »). Elle ne s'ouvre que s'il y a un point à vérifier. Les erreurs de lecture de la relecture elle-même laissent l'envoi continuer. Ne s'applique pas à la reprise d'un envoi déjà en file.
- **Motifs de réserve** : ils préremplissent le texte, jamais une réserve. La dictée passe par le micro du clavier (aucun module vocal ajouté, donc aucune permission nouvelle).
- **Depuis la dernière visite** : n'utilise que des visites du local, hors visites historiques importées de l'Intranet. Les réserves comptées sont celles nées dans ce local.
- **Courbe des compteurs** : à partir de trois relevés. Le repère « vs rythme habituel » compare le rythme par jour de la période en cours à la moyenne des périodes précédentes (au moins deux), seuil ±40 %. Une baisse d'index (remplacement) n'est pas une période. Indication seulement.
- **Recherche globale** : clients, sites, locaux de l'appareil et fiches de règles. La flèche garde l'accès à l'annuaire Intranet.

## Tests

`test_journee.js`, `test_relecture.js`, `test_releve_historique.js`, `test_derniere_visite.js`, `test_motifs_reserve.js`, `test_recherche_globale.js` (modèles purs et requêtes SQL sur une base migrée), lancés par `run_source_patches.js`.
