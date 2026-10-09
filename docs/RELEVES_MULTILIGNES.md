# Relevés multi-lignes (compteurs et températures)

## Format

Une cellule de relevé peut contenir plusieurs relevés, **un par ligne** :

```
Compteur gaz A : 12345 m³
Compteur gaz B : 7,5 m³
```

Pour un relevé sans nom, la ligne ne porte que la valeur (`4521 MWh`, `56,2`).

## Import Excel

- Une cellule d'**index** multi-lignes crée **un compteur par ligne** (même type = même destination de rapport). Le premier garde le nom de la ligne de la trame, les suivants sont nommés d'après leur ligne ou numérotés (« … 2 »).
- Une cellule de **température** multi-lignes (section Températures et pH, relevés uniquement) garde la première valeur dans le champ de la trame ; les suivantes deviennent des mesures ajoutées du même circuit (« Chauffage · Départ 2 »).
- Lignes vides et **doubles sauts de ligne ignorés** ; l'ancien séparateur « | » reste lu.

## Export Excel et Intranet

- Compteurs du même type : **une seule cellule**, une ligne `nom : index unité` par compteur. Un seul compteur : valeur seule, comme avant (Intranet) ou `nom : index unité` (Excel ICPE).
- Températures : les mesures ajoutées du même circuit **et** du même sens (départ, retour, stockage/ballon) rejoignent la cellule de la température correspondante. Les autres (ex. « Mélange ») restent dans l'annexe Excel, inchangée.
- Plusieurs compteurs sur la même ligne ne bloquent plus l'envoi Intranet : ils sont regroupés.

Code : `releveMultiligne.js` (pur), contrôlé par `.github/scripts/test_releve_multiligne.js`.
