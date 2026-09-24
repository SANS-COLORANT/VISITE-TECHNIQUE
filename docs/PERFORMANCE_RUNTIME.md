# METRA — Runtime terrain durable et performance

## Objectif

METRA doit donner l'impression d'être instantané sur tablette sans transformer la mémoire vive en source de vérité.

La règle est :

1. l'interface réagit immédiatement ;
2. SQLite et le stockage privé Android restent les sources durables ;
3. les caches sont petits, bornés et remplaçables ;
4. les tâches lourdes ne bloquent jamais l'ouverture d'une visite ;
5. un retour, un swipe, une mise en veille ou un redémarrage ne doit pas faire perdre le contexte ni les dernières saisies.

## Niveaux HOT / WARM / COLD

### HOT

Au maximum **3 visites**.

Le niveau HOT conserve uniquement ce qui apporte un bénéfice immédiat :
- aperçu d'identité de la visite ;
- état UI léger ;
- données de trame déjà lues dans les caches spécialisés bornés ;
- régulation / remarques récemment utilisées.

Les originaux photo, documents, exports et catalogues lourds ne sont jamais conservés comme payload HOT.

### WARM

Au maximum **12 visites** sous forme de métadonnées légères.

Le niveau WARM sert à afficher immédiatement :
- client ;
- site ;
- local ;
- date ;
- trame ;
- statut ;
- progression.

Les données détaillées restent dans SQLite.

### COLD

Aucun payload métier n'est maintenu en RAM. La visite est chargée depuis SQLite à la demande.

## Préchargement au toucher

Les transitions terrain suivent une logique onPressIn :

- Client → précharge Sites ;
- Site → précharge Locaux ;
- Local → précharge Historique des visites ;
- Visite → précharge la trame, la régulation et la référence précédente.

Le préchargement est coalescé : deux demandes simultanées du même périmètre ne lancent pas deux lectures identiques.

Les écrans affichent d'abord les dernières données locales connues, puis les rafraîchissent silencieusement (stale-while-revalidate).

## Ouverture d'une visite

Le clic transmet immédiatement un aperçu contenant les identifiants et libellés déjà connus.

VisiteScreen peut donc afficher immédiatement :
- client ;
- site ;
- local ;
- trame ;
- progression connue.

La lecture SQLite minimale confirme ensuite ces données. Les autres travaux sont secondaires :
- préremplissage ;
- recalcul de progression ;
- chargement VMC ;
- préchauffage des caches ;
- préparation de la comparaison précédente.

Ils ne doivent pas retarder le premier rendu.

## Préremplissage

Le préremplissage reste conforme à METRA_RULES.md.

ICPE / VMC :
- dernières valeurs connues du même local et de la même trame ;
- champs ;
- avis ;
- commentaires de contrôle autorisés ;
- réseaux ;
- compteurs ;
- mesures prévues par la règle métier.

Pré-allumage :
- uniquement les données stable / carryForward ;
- contrôles et essais du jour laissés vides.

Le préremplissage terminé est marqué durablement. Une réouverture ne doit pas recopier à nouveau tout l'historique.

Les réserves, photos et conclusions historiques ne sont jamais clonées dans la nouvelle visite.

## Référence de la visite précédente

Une référence précédente est préparée en arrière-plan et conservée dans un cache borné à 3 visites.

Elle est strictement séparée des observations courantes. Elle peut servir à comparer :
- champs ;
- contrôles ;
- compteurs ;
- réseaux.

Elle ne crée ni réserve, ni photo, ni conclusion dans la visite du jour.

## Pager et swipe

La règle historique de performance est maintenue :
- courant + voisin gauche + voisin droit seulement lorsque nécessaire ;
- pas de montage simultané de toutes les pages ;
- les panneaux lourds restent lazy ;
- le pager natif conserve sa piste animée ;
- les swipes Pré-allumage locaux restent séparés du pager principal.

Un cache global agressif ou le montage complet de plusieurs grosses SST / pages Pré-allumage est interdit.

## Saisie et sauvegarde

Une saisie doit être optimiste :
- la valeur change immédiatement à l'écran ;
- le cache chaud reçoit immédiatement la nouvelle valeur ;
- l'écriture SQLite est sérialisée derrière ;
- un délai court évite une écriture par caractère ;
- blur, swipe, retour, démontage et passage en arrière-plan déclenchent un flush.

Les anciens champs utilisant useSaisieAvecAutoSave passent par le même pipeline durable que useDurableAutosave.

Un état discret peut indiquer :
- ✓ Enregistré ;
- N en attente ;
- erreur de sauvegarde.

Cet indicateur ne doit jamais bloquer le travail.

## Contexte de navigation

Le contexte UI est petit, borné et persisté séparément dans _meta.

Il peut mémoriser :
- position verticale ;
- tri des sites ;
- onglet Site actif ;
- onglet de visite actif ;
- position dans les panneaux de visite.

La mémoire durable conserve au maximum 24 contextes UI récents.

Un retour doit remettre l'utilisateur au même endroit, sans recalculer un écran complet uniquement pour restaurer sa position.

## Appareil photo instantané

Le pipeline caméra suit la même règle que la navigation : **le geste terrain ne doit pas attendre le stockage**.

Avant le clic final, METRA peut préchauffer sans effet métier :
- état de permission caméra déjà accordée ;
- dossier privé de la visite ;
- index photo de la visite ;
- cible de classement si elle existe déjà.

Un simple `onPressIn` ne doit jamais créer une réserve ou modifier une donnée métier.

Au retour de l'appareil photo :
- la prise apparaît immédiatement dans l'interface avec un identifiant temporaire ;
- le bouton redevient disponible dès que la caméra est fermée ;
- copie privée METRA, journal de récupération, SQLite, copie Documents et variantes sont traités derrière ;
- une série de photos peut continuer pendant que les précédentes se finalisent ;
- le mode Compagnon copie et envoie ses prises en arrière-plan, avec une outbox sérialisée.

La première autorisation Android peut afficher le dialogue système : ce délai n'est pas masquable. Une fois l'autorisation accordée, elle est mise en cache et n'est plus redemandée à chaque prise.

Les captures utilisées comme image de patrimoine suivent la même logique : aperçu immédiat au retour caméra, puis compression et copie durable en arrière-plan.

## Photos

L'original est copié immédiatement dans le stockage privé durable METRA.

Trois niveaux d'affichage sont utilisés :
- **miniature** : 320 px, pour listes / cartes ;
- **aperçu** : 1280 px, pour consultation normale ;
- **original** : uniquement sur demande HD, zoom détaillé, export ou rapport.

Les miniatures et aperçus sont régénérables et stockés dans le cache Android :
- maximum indicatif 160 miniatures ;
- maximum indicatif 36 aperçus ;
- 2 générations simultanées maximum.

Une photo est journalisée avant son rattachement final SQLite. Si l'application est interrompue entre les deux, la visite tente de récupérer la photo à la réouverture.

## Grandes listes

Les listes terrain doivent être virtualisées :
- sites ;
- locaux ;
- visites ;
- équipements ;
- remarques ;
- photos ;
- relevés ;
- grandes matrices de pilotage.

Le pilotage patrimoine utilise une matrice de sites virtualisée au lieu de monter toutes les lignes du client.

## Recherche

Les recherches déjà chargées localement doivent filtrer instantanément sans nouvelle requête réseau :
- sites : nom, adresse, groupe / lot, note ;
- locaux : nom, trame, type ;
- catalogues : recherche locale avec debounce si une requête SQLite est nécessaire.

## Intranet et offline

Le travail terrain ne doit jamais attendre l'Intranet.

La saisie locale est prioritaire. Les échanges Intranet utilisent les caches et files persistantes existantes.

Le module Missions reste strictement indépendant de l'Intranet.

## Régressions historiques à ne pas réintroduire

Les protections suivantes sont structurelles :

- ne pas monter deux grosses pages Pré-allumage complètes pour rendre un swipe fluide ;
- ne pas créer de cache global non borné ;
- ne pas vider les trois visites HOT simplement parce que l'utilisateur revient à l'écran précédent ;
- ne pas dépendre d'un fichier temporaire ImagePicker après la capture ;
- ne pas relancer le préremplissage complet à chaque réouverture ;
- ne pas mélanger ICPE, VMC et Pré-allumage dans les exports ou les reprises ;
- ne pas utiliser un libellé de site/local comme identité : les IDs stables restent la référence ;
- ne pas corriger une fonctionnalité runtime uniquement par un patch de build.

## Validation terrain

Avant fusion :
- ouvrir / fermer plusieurs fois les 3 mêmes visites ;
- ouvrir une 4e visite et vérifier l'éviction de la plus ancienne sans perte de donnée ;
- revenir après scroll profond sur Site / Local / Visite / panneaux ;
- tuer puis relancer l'application et vérifier l'onglet / position restaurés ;
- saisir un commentaire puis swiper immédiatement ;
- changer rapidement S / N.S / N.R / S.O / N.V ;
- saisir plusieurs compteurs / températures ;
- prendre une photo puis quitter immédiatement ;
- galerie avec grand volume photo ;
- client avec grand nombre de sites ;
- coupure réseau / mode avion ;
- ICPE / VMC / Pré-allumage ;
- bundle JavaScript ;
- compilation Android release.
