# Garde-fou d'ouverture des visites

`patch_visit_open_fail_safe.py` s'applique après les patches Pré-allumage et création/export.

But : l'enregistrement minimal de la visite est chargé et affiché avant le préremplissage, la progression, les caissons VMC et les préchargements de panneaux. Les préparations secondaires sont isolées par des `try/catch` afin qu'une erreur ou une donnée importée atypique ne puisse plus laisser `VisiteScreen` sur un `ActivityIndicator` sans fin.

En cas d'échec de la lecture minimale, l'écran affiche une erreur avec `Retour` et `Réessayer` au lieu de mouliner indéfiniment.
