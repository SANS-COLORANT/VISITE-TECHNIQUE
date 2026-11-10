# RCU – Cases réseau 1 à 6 / correspondance Intranet

Le modèle Excel contient six blocs réseaux aux lignes 91, 101, 111, 121, 131 et 141.
Erreur ancienne : le sérialiseur comparait le nom du réseau local à celui des sous-catégories Symfony.
Un réseau nommé « Chauffage bâtiment A » ne correspondait pas à « Réseau n°1 ».

Règle corrigée : si la trame Symfony liée porte explicitement Réseau 1..6 comme
groupe de critères ou comme case texte, utiliser ces emplacements dans l’ordre
des réseaux enregistrés dans la visite (avec priorité à la provenance serveur
lorsqu'elle existe). Trois réseaux remplissent les cases 1,2,3 ; 4,5,6 restent `/`.

Lorsque le nombre dépasse la capacité six, les réseaux 7+ sont regroupés
dans le sixième emplacement avec des sauts de ligne et les noms des réseaux.
Les 6 champs métier sont représentés dans la case texte ou dans les colonnes
correspondantes des groupes. Les limites de longueur des critères restent actives.

Si le référentiel Symfony ne publie aucune case numérotée et qu’aucun
rapprochement par ID de provenance ou nom exact n’existe, aucun critère distant
n'est inventé. Une erreur explicite signale les cases reconnues.
La solution précédente « déplacer les trois réseaux dans des notes » est retirée.
Pas de mutation SQLite, pas de modification Excel, ICPE/REMAR inchangés.

Tests : node .github/scripts/test_rcu_network_six_slots.js ; npm run verify:metra.
Validation production réelle nécessaire : la liste des sous-catégories /
critères Symfony doit être obtenue du local concerné et un POST de recette
doit confirmer les contenus avant déploiement opérationnel.
