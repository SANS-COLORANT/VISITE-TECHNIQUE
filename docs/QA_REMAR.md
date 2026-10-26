# Recette — application complète avec TRAME REMAR

## Base et pièges historiques examinés

- Source du dernier APK complet trouvé : build 678, commit `beaa6bcfa569ef717f6d2dd0759542f897f33429`.
- Base conservée : correctif PDF OOM et photos, commit `f4b05f64fb2ceb02d7b7c000084757992ac69727` (PR #102).
- Anciennes PR : identité local/site, maillage, réimports et compteurs, OCR, conservation des photos, patrimoine par trame et séparation Primaire/Secondaire.
- Ancien workflow reproduit dans une copie : des patches échouent sur les marqueurs récents et d’autres réécrivent des sources déjà préparées. Ils sont exclus du nouveau workflow ; aucune de ces mutations de diagnostic n’a été copiée sur la branche de livraison.
- Ancien script de captures : une installation ratée pouvait sortir avec code 0. Le nouveau smoke test est bloquant et teste l’APK signé réellement produit.
- L’APK d’aperçu isolé antérieur n’est pas utilisé comme base de l’application complète.

## Contrôles exécutés localement

- `npm ci` avec postinstall de vérification : réussi, aucun fichier suivi modifié par l’installation.
- Contrats METRA existants : réussis (créations/maillage, réserves, imports, destinations compteurs, patrimoine, photos, performances, isolation Missions, syntaxe).
- 13 tests exécutables REMAR/bibliothèque : vrais mappings et modèle, 141 lignes avec en-tête, commentaires des cinq avis, export/réimport SQLite, ajout/retrait/renommage de points, versions immuables, modèles Excel nettoyés, validation de contenu, masquage/réactivation, rechargement des versions et maintien des trames existantes.
- Non-régression synthétique PDF 457 photos : réussie.
- Bundle Android complet : réussi.

## Validation Android de livraison

Le résultat réel du workflow GitHub est ajouté à la PR après exécution. La
publication est conditionnée à Gradle release, à la signature historique et au
parcours sur émulateur : ouverture, bibliothèque, création REMAR, saisie native
et redémarrage. Les captures et le logcat sont conservés comme artefacts.

## Limites terrain

Pas de tablette physique, serveur Intranet authentifié, caméra réelle ni base
client réelle dans cet environnement. Le test PDF 457 photos valide la structure
de découpage, pas une mesure de mémoire sur la tablette de l’utilisateur.

Statut final : à renseigner après le résultat de compilation et du smoke Android.
