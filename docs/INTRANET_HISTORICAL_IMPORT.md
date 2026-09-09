# Import Intranet : historique puis nouvelle visite METRA

## Principe

L'Intranet et METRA ne portent pas la même notion de réserve liée à un contrôle.

Dans l'Intranet, `remarques[]` appartient à la dernière visite globale et aucune relation ne relie une remarque à un `LocalCritere` précis. METRA ne doit donc jamais inventer ce lien.

Le comportement attendu est séparé en deux temps.

## 1. Visite historique importée depuis l'Intranet

Pour chaque critère de préparation :

- `visiteSourceId` est une provenance uniquement ;
- l'identité distante d'une branche est `categorieId + sousCategorieId + critereId` ;
- les avis `S`, `N.S`, `N.R`, `S.O`, `N.V` sont importés dans le contrôle METRA correspondant ;
- le commentaire d'une conformité classique n'est pas affiché ni transformé en réserve METRA ;
- exception ICPE : dans le panneau Relevés, le commentaire peut porter la valeur métier elle-même (pH, température). Cette valeur technique est conservée ;
- `/` reste une valeur vide.

Les objets `remarques[]` sont importés dans la synthèse des réserves de cette visite historique avec `origine = Intranet`, sans `controle_key`. Ils restent donc autonomes et ne sont jamais rattachés artificiellement à un `N.S`.

Le JSON brut de préparation reste conservé dans la provenance de la visite afin de ne pas perdre le commentaire historique même lorsqu'il n'est pas affiché comme commentaire de conformité.

## 2. Création de la visite suivante

Pour ICPE/VMC :

- les champs réutilisables sont repris selon la règle générale de carry-forward ;
- les avis `S/N.S/N.R/S.O/N.V` de la visite précédente sont repris ;
- si la visite précédente est une visite historique Intranet, ses commentaires ordinaires de conformité ne sont pas repris ;
- les valeurs techniques ICPE du panneau Relevés restent reprises ;
- les réseaux et compteurs ICPE continuent d'être repris ;
- aucune remarque/réserve de la visite précédente n'est clonée ;
- aucune photo historique n'est clonée.

Ainsi un `N.S` historique arrive dans la nouvelle visite comme `N.S`, mais sans ancienne réserve. Le composant METRA de conformité affiche alors son mécanisme normal de cause/réserve. Le technicien confirme le défaut, choisit une cause ou saisit une réserve libre ; cette nouvelle réserve est alors liée au `controle_key` de la nouvelle visite et apparaît dans sa synthèse.

Si le technicien repasse le contrôle à `S`, la réserve METRA liée à ce contrôle est supprimée selon le comportement standard.

Pré-allumage reste l'exception : ses contrôles ne sont jamais reportés automatiquement dans la nouvelle visite.

## Règles de non-régression

1. Ne jamais utiliser `visiteSourceId === derniereVisite.id` comme filtre.
2. Ne jamais lier une `remarque[]` Intranet à un contrôle par ressemblance de texte.
3. Ne jamais copier les anciennes réserves dans une nouvelle visite.
4. Ne jamais supprimer les mesures techniques portées par `commentaire` dans les contrôles ICPE de Relevés.
5. Les libellés de critère réutilisés dans plusieurs branches doivent être désambiguïsés avec le contexte catégorie/sous-catégorie.
6. Les critères non mappés doivent rester visibles dans les diagnostics d'import afin d'éviter les pertes silencieuses.

## Scénario de validation

### Historique Intranet

Entrée :

- `Ferme porte = N.S`, commentaire Intranet présent ;
- `Ventilation basse = S`, commentaire éventuel ;
- `PRIMAIRE: T° départ = S`, commentaire `75°C` ;
- une ou plusieurs `remarques[]` Intranet.

Attendu :

- `Ferme porte` affiche `N.S` sans commentaire historique ;
- `Ventilation basse` affiche `S` sans commentaire historique ;
- `PRIMAIRE: T° départ` affiche `S` avec la valeur `75°C` ;
- les remarques Intranet sont visibles uniquement dans la synthèse de la visite historique et n'ont pas de `controle_key`.

### Nouvelle visite METRA

Attendu :

- `Ferme porte` démarre à `N.S` ;
- `Ventilation basse` démarre à `S` ;
- `PRIMAIRE: T° départ` reprend `S` et `75°C` ;
- aucune réserve Intranet n'est présente dans la synthèse de la nouvelle visite ;
- le `N.S` affiche le mécanisme METRA de cause/réserve dans son onglet ;
- dès que le technicien choisit/saisit la nouvelle réserve, celle-ci apparaît dans la synthèse de la nouvelle visite et est liée au contrôle exact.
