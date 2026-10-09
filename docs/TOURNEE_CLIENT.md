# Tournée du client et envoi groupé

## Tournée (sites et locaux à faire)

- Écran du client → **Tournée** : cocher les sites (et, par site, des locaux) à faire.
- L'état **Fait** est **déduit des visites** : créer une visite sur un local coche le local et son site (visite créée après l'ajout à la tournée). Supprimer la visite remet la cible à faire. Rien n'est saisi à la main, donc aucun oubli silencieux.
- Bandeau « Tournée · 8/20 sites faits » avec barre de progression ; le toucher n'affiche que les sites restant à faire.
- Liste des locaux d'un site : pastille « + À faire » / « À faire » / « Fait » par local.
- Stockage : table `tournee_cibles` (migration 047, additive). Module : `tourneeDb.js`, test `.github/scripts/test_tournee.js`.

## Envoi groupé vers l'Intranet

- Écran du client → **Envoyer · N** : envoie toutes les visites **terminées** du client, reliées à l'Intranet et pas encore confirmées, une par une.
- Mêmes garde-fous que l'envoi visite par visite : même client Intranet imposé, aucun doublon (reprise des envois en attente, jamais de nouvel envoi si verrouillé), photos par lots.
- Ce qui demande une décision (confirmation du listing matériel, envoi verrouillé) est listé dans le bilan et se fait depuis la visite. Les visites en cours ne sont pas envoyées (l'envoi crée une visite serveur).
