# RCU : réseaux non attribuables aux rubriques Symfony

Incident : 3 réseaux locaux présents dans une visite Réseau de chaleur
mais sans sous-catégories Intranet identifiables par ID de provenance ou nom.
L'ancien comportement bloquait les 3 réseaux.

Nouvelle politique spécifique `reseau_chaleur_v1` :
- Réseau mappable de manière certaine : envoyer chaque mesure dans son critère.
- Champ métier présent mais sans critère dédié : archive en note de visite.
- Réseau sans branche Intranet identifiée : archive des 6 attributs métier
  (nom, températures, courbe, TNC, programme), avec ordre d'origine.
- Ambiguïté de noms ou provenance : ne pas deviner ; diagnostic en note.
- Les critères hors réseau et le nombre de critères distants restent identiques.
- Données SQLite et Excel originales inchangées.
- Plus de 100 notes ou >5 MiB : garde-fou serveur inchangé, envoi refusé.
- Si l'archive en notes n'est pas possible : refus conservatoire.
- ICPE, REMAR et autres trames : correspondance historique inchangée.

IMPORTANT : la note est une conservation lisible dans la visite, PAS un
remplissage structurel des critères réseau Symfony absents. Une API serveur
fournissant des identifiants de réseau stables reste nécessaire pour une
parité complète. Tests d'une visite RCU réelle à exécuter avant production.

Régression automatique : `node .github/scripts/test_rcu_network_intranet_fallback.js`.
