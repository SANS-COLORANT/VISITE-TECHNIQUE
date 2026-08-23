// Réserves complémentaires validées pour les onglets de conformité.
// Elles complètent PRESCRIPTIONS sans modifier la trame Excel d'origine.
// Les prix restent volontairement à null lorsqu'ils n'ont pas été validés :
// ils sont modifiables au niveau de chaque visite.

const R = (critere, poste, prestation, delai = 1, estimatif = null) => ({ critere, poste, prestation, delai, estimatif });

export const RESERVE_EXTENSIONS = {
  // -------------------------------------------------------------------------
  // CONF. LOCAL
  // -------------------------------------------------------------------------
  'Situation': [
    R('Local encombré', 'Entretien P2', 'Débarrasser le local technique de tout stockage ou matériel sans rapport avec l’exploitation afin de maintenir les accès et organes techniques dégagés.'),
    R('Local dégradé', 'Travaux', 'Remettre en état les parois, sols et plafonds dégradés du local technique.', 6),
    R('Infiltrations', 'Travaux', 'Rechercher l’origine des infiltrations et procéder aux réparations nécessaires afin de supprimer les entrées d’eau dans le local technique.', 3),
  ],
  'Accessibilité': [
    R('Accès encombré', 'Entretien P2', 'Libérer et maintenir dégagé l’accès au local technique.'),
    R('Accès difficile / dangereux', 'Travaux de conformité', 'Sécuriser l’accès au local technique et mettre en place les équipements nécessaires à un accès sûr des intervenants.', 3),
    R('Serrure / accès défectueux', 'Entretien P2', 'Remettre en état le dispositif d’ouverture et de fermeture permettant l’accès au local technique.'),
  ],
  'Ferme porte': [
    R('Réglage défectueux', 'Entretien P2', 'Régler le ferme-porte afin d’assurer la fermeture complète et automatique de la porte.'),
  ],
  'Repérage chaufferie': [
    R('Dégradé / illisible', 'Entretien P2', 'Remplacer ou remettre en état la signalétique d’identification du local technique.'),
  ],
  'Ventilation basse': [
    R('Obstruée', 'Entretien P2', 'Nettoyer et dégager la ventilation basse afin de rétablir la section libre de ventilation.'),
  ],
  'Ventilation haute': [
    R('Obstruée', 'Entretien P2', 'Nettoyer et dégager la ventilation haute afin de rétablir la section libre de ventilation.'),
  ],
  'Emplacements': [
    R('Non adapté', 'Travaux de conformité', 'Modifier l’implantation des ventilations afin d’assurer un balayage efficace du local conformément aux exigences applicables.', 6),
  ],
  'Section': [
    R('Insuffisante', 'Travaux de conformité', 'Redimensionner ou créer les amenées et évacuations d’air afin d’obtenir la section nécessaire.', 6),
  ],
  'Extincteurs: Nombre': [
    R('Contrôle périodique dépassé', 'Entretien réglementaire', 'Faire procéder au contrôle des extincteurs et mettre à jour les étiquettes de vérification.'),
  ],
  'Extincteurs: Type': [
    R('Inadapté', 'Sécurité incendie', 'Remplacer ou compléter les extincteurs par des appareils adaptés aux risques du local technique.'),
  ],
  'Détection gaz: Présence': [
    R('Hors service', 'Sécurité gaz', 'Remettre en état la détection gaz et procéder au contrôle fonctionnel complet de la chaîne de sécurité.'),
    R('Contrôle non justifié', 'Entretien réglementaire', 'Faire réaliser un essai fonctionnel de la détection gaz et consigner le résultat dans le registre de maintenance.'),
  ],
  'Détection incendie: Présence': [
    R('Hors service', 'Sécurité incendie', 'Remplacer le détecteur incendie défectueux et procéder à un essai fonctionnel de l’installation.'),
  ],
  'Désenfumage: DM / accès': [
    R('Déclencheur inaccessible', 'Sécurité incendie', 'Rendre accessible et clairement repérable le dispositif manuel de commande du désenfumage.'),
  ],
  'Alarme sonore: Présence': [
    R('Sirène HS / inaudible', 'Sécurité incendie', 'Remettre en état ou remplacer la sirène afin que l’alarme soit audible dans l’ensemble du local.'),
  ],
  'Alarme visuelle: Présence': [
    R('Gyrophare HS / non visible', 'Sécurité incendie', 'Remettre en état ou repositionner l’alarme visuelle afin qu’elle soit visible depuis les zones concernées.'),
  ],
  'Consignes de sécurité': [
    R('Pas à jour', 'Entretien P2', 'Mettre à jour les consignes de sécurité et les coordonnées utiles affichées dans le local.'),
  ],
  'Plan de sécurité': [
    R('Pas à jour', 'Entretien / conformité', 'Mettre à jour et afficher le plan de sécurité correspondant à la configuration actuelle de l’installation.', 3),
  ],
  'Schéma hydraulique à jour': [
    R('Absent', 'Études / Exploitation', 'Établir et afficher dans le local un schéma hydraulique de principe de l’installation.', 3),
    R('Pas à jour', 'Études / Exploitation', 'Mettre à jour le schéma hydraulique affiché afin qu’il corresponde aux installations réellement présentes.', 3),
  ],
  'Evacuations des EU - Etat': [
    R('Bouchée / mauvais écoulement', 'Entretien P2', 'Déboucher et nettoyer l’évacuation des eaux du local afin de garantir son bon écoulement.'),
    R('Fuite / dégradation', 'Travaux', 'Réparer ou remplacer les éléments dégradés du réseau d’évacuation des eaux du local.', 3),
  ],
  'Evacuations des EU - Condensats': [
    R('Dispositif saturé', 'Entretien P2', 'Remplacer la charge de neutralisation et remettre en état le dispositif de traitement des condensats.'),
  ],
  'Evacuations des EU - Caillebotis': [
    R('Dégradé / dangereux', 'Travaux', 'Remettre en état ou remplacer le caillebotis afin de supprimer tout risque de chute ou de blessure.', 3),
  ],
  'Robinet de puisage: Présence': [
    R('Hors service / fuite', 'Entretien P2', 'Remettre en état le robinet de puisage et supprimer toute fuite.'),
  ],

  // -------------------------------------------------------------------------
  // CONF. ÉNERGIE
  // -------------------------------------------------------------------------
  'Coupure combustible - Présence': [
    R('Manquante sur un accès', 'Travaux de conformité', 'Mettre en place une commande de coupure extérieure du combustible à proximité de chaque accès concerné.', 3),
    R('Inaccessible', 'Entretien P2', 'Rendre accessible la commande de coupure extérieure du combustible et maintenir son accès dégagé.'),
    R('Hors service', 'Sécurité gaz', 'Remettre en état la chaîne de coupure extérieure du combustible et procéder à un essai fonctionnel.'),
  ],
  'Coupure combustible - Type': [
    R('Une seule électrovanne', 'Travaux de conformité', 'Compléter le dispositif de sécurité combustible afin d’obtenir une chaîne de coupure adaptée à l’installation.', 3),
  ],
  'Coupure combustible - Coffret': [
    R('Inaccessible / bloqué', 'Entretien P2', 'Remettre en état et rendre accessible le coffret de coupure combustible afin de permettre une action rapide en cas d’urgence.'),
  ],
  'Coupure combustible - Signalétique': [
    R('Illisible / dégradée', 'Entretien P2', 'Remplacer la signalétique de coupure combustible extérieure afin qu’elle soit clairement identifiable.'),
  ],
  'Coupure électrique - Présence': [
    R('Manquante sur un accès', 'Travaux de conformité', 'Ajouter une commande de coupure électrique extérieure au droit de l’accès concerné.', 3),
    R('Hors service', 'Travaux électriques', 'Remettre en état la coupure électrique extérieure et procéder à un essai fonctionnel.'),
  ],
  'Coupure électrique - Coffret': [
    R('Inaccessible', 'Entretien P2', 'Libérer et maintenir accessible le coffret de coupure électrique extérieure.'),
  ],
  'Coupure électrique - Signalétique': [
    R('Illisible / dégradée', 'Entretien P2', 'Remplacer la signalétique de la coupure électrique extérieure.'),
  ],
  'Coupure électrique - Séparation F/L/R': [
    R('Relevage non identifié / non séparé', 'Travaux électriques', 'Reprendre l’organisation de la coupure extérieure afin d’identifier et de séparer clairement Force, Lumière et les équipements devant rester alimentés.', 3),
  ],
  'Vanne gaz / chaudière': [
    R('Grippée / non manœuvrable', 'Entretien / P3', 'Remettre en état ou remplacer la vanne de coupure gaz afin de garantir sa manœuvrabilité.'),
    R('Inaccessible', 'Entretien P2', 'Rendre accessible la vanne de coupure gaz de la chaudière.'),
    R('Fuite constatée', 'Sécurité gaz', 'Faire contrôler immédiatement l’étanchéité de la ligne gaz et réparer l’organe défectueux.'),
  ],
  'Filtre / chaudière': [
    R('Encrassé', 'Entretien P2', 'Nettoyer ou remplacer l’élément filtrant de la ligne gaz et contrôler la perte de charge après intervention.'),
    R('Dégradé / fuite', 'Entretien / P3', 'Remplacer le filtre gaz dégradé et contrôler l’étanchéité de l’installation après intervention.'),
  ],
  'Pressostats / chaudière': [
    R('Hors service', 'Entretien / P3', 'Remplacer le pressostat gaz défectueux puis contrôler le fonctionnement de la sécurité brûleur.'),
    R('Réglage non justifié', 'Entretien P2', 'Contrôler et consigner les seuils de réglage des pressostats gaz conformément aux caractéristiques du brûleur et de l’alimentation.'),
  ],
  'Manomètre gaz': [
    R('Hors service', 'Entretien P2', 'Remplacer le manomètre gaz défectueux.'),
    R('Illisible', 'Entretien P2', 'Remplacer le manomètre gaz dont la lecture n’est plus exploitable.'),
  ],
  'Compteur gaz (1/chaudière si Pu > 1 MW)': [
    R('Hors service', 'Travaux / comptage', 'Remettre en état ou remplacer le compteur gaz et rétablir le suivi des consommations.', 3),
    R('Inaccessible', 'Entretien P2', 'Rendre le compteur gaz accessible pour permettre les relevés et opérations de maintenance.'),
  ],
  'Armoire - Schéma électrique': [
    R('Non disponible dans le local', 'Travaux de conformité', 'Mettre à disposition le schéma électrique à jour à proximité de l’armoire concernée.', 3),
  ],
  'Armoire - Câblage': [
    R('Connexions desserrées / échauffement', 'Maintenance électrique', 'Faire contrôler l’armoire électrique, resserrer les connexions et traiter les traces d’échauffement constatées.'),
    R('Conducteurs désordonnés', 'Travaux électriques', 'Reprendre et organiser le câblage de l’armoire afin de faciliter la maintenance et le repérage.', 3),
  ],
  'Armoire - Protection': [
    R('Partie active accessible', 'Sécurité électrique', 'Remettre en place les capots, obturateurs ou protections nécessaires afin d’empêcher tout contact avec une partie active.'),
    R('Porte / serrure dégradée', 'Entretien / P3', 'Remettre en état la fermeture de l’armoire électrique afin de garantir la protection des équipements.'),
  ],
  'Armoire - Espace libre': [
    R('Insuffisant', 'Travaux électriques', 'Prévoir l’extension ou le remplacement de l’armoire afin de conserver une capacité disponible suffisante pour les évolutions et la maintenance.', 6),
  ],
  'Armoire - Prise': [
    R('Protection 30 mA non justifiée', 'Maintenance électrique', 'Vérifier la protection différentielle de la prise de maintenance et remettre l’installation en conformité si nécessaire.'),
  ],
  'BAES - Presence': [
    R('Hors service', 'Sécurité électrique', 'Remplacer le BAES hors service et effectuer un essai de fonctionnement.'),
    R('Batterie défaillante', 'Entretien réglementaire', 'Remplacer la batterie ou le BAES ne garantissant plus son autonomie.'),
    R('Contrôle périodique non justifié', 'Entretien réglementaire', 'Réaliser le contrôle fonctionnel des BAES et consigner la vérification.'),
  ],
  'Eclairage': [
    R('Luminaire détérioré', 'Entretien P2', 'Remplacer ou remettre en état le luminaire détérioré du local technique.'),
    R('Zone technique mal éclairée', 'Travaux d’amélioration', 'Ajouter ou repositionner les luminaires afin d’assurer un éclairage suffisant des zones d’intervention.', 3),
  ],
  'Chemins de câbles électriques avec liaison équipotentiel': [
    R('Continuité non justifiée', 'Maintenance électrique', 'Faire contrôler la continuité des liaisons équipotentielles et reprendre les connexions défectueuses.', 3),
    R('Connexion dégradée', 'Travaux électriques', 'Remettre en état la liaison équipotentielle des éléments métalliques concernés.'),
  ],
  'Etat du local': [
    R('Présence d’eau à proximité électrique', 'Sécurité / Travaux', 'Rechercher et supprimer l’origine de la présence d’eau et sécuriser les équipements électriques exposés.'),
  ],
  'Calorifuge': [
    R('Partiellement absent', 'Travaux d’amélioration', 'Compléter le calorifuge des canalisations et accessoires non isolés.', 6),
    R('Finitions dégradées', 'Travaux d’amélioration', 'Reprendre les manchettes, coquilles ou finitions dégradées du calorifuge afin de restaurer la continuité de l’isolation.', 6),
  ],

  // -------------------------------------------------------------------------
  // CONF. CHAUFFAGE
  // -------------------------------------------------------------------------
  'Chauffage - Type de disconnection': [
    R('Hors service', 'Travaux de conformité', 'Remplacer ou remettre en état le disconnecteur de l’appoint chauffage et vérifier son bon fonctionnement.'),
    R('Fuite', 'Entretien / P3', 'Réparer ou remplacer le disconnecteur présentant une fuite.'),
    R('Évacuation absente', 'Travaux de conformité', 'Raccorder correctement l’évacuation du disconnecteur vers un dispositif d’écoulement visible et adapté.', 3),
    R('Inaccessible', 'Entretien P2', 'Rendre le disconnecteur accessible pour les opérations de contrôle et de maintenance.'),
  ],
  "Chauffage - Compteur d'eau: Présence": [
    R('Hors service', 'Travaux d’amélioration', 'Remplacer ou remettre en état le compteur volumétrique d’appoint chauffage.', 3),
    R('Index illisible', 'Travaux d’amélioration', 'Remplacer le compteur dont l’index n’est plus exploitable.', 3),
    R('Inaccessible', 'Entretien P2', 'Rendre accessible le compteur d’appoint pour permettre son relevé périodique.'),
  ],
  'Chauffage - Type de filtration': [
    R('Encrassé', 'Entretien P2', 'Nettoyer le dispositif de filtration / désembouage et contrôler son fonctionnement après intervention.'),
    R('Purge défectueuse', 'Entretien P2', 'Remettre en état le dispositif de purge du désemboueur / séparateur afin de permettre son entretien.'),
    R('Pas de by-pass maintenance', 'Travaux d’amélioration', 'Modifier l’installation afin de permettre la maintenance du dispositif de filtration sans arrêt prolongé de l’installation.', 6),
  ],
  "Chauffage - Pot d'introduction": [
    R('Absent', 'Travaux d’amélioration', 'Installer un pot d’introduction permettant l’injection sécurisée des produits de traitement dans le réseau chauffage.', 3),
    R('Hors service / fuite', 'Entretien / P3', 'Remplacer ou remettre en état le pot d’introduction défectueux.'),
    R('Vannes inopérantes', 'Entretien P2', 'Remettre en état les organes d’isolement du pot d’introduction afin de permettre son utilisation en sécurité.'),
  ],
  'Chauffage - Produit de traitement': [
    R('Absent', 'Entretien P2', 'Mettre en œuvre un traitement d’eau adapté aux caractéristiques du réseau et aux préconisations des fabricants.'),
    R('Produit non identifié', 'Entretien P2', 'Identifier, étiqueter et consigner le produit de traitement utilisé sur le circuit chauffage.'),
    R('Stockage inadapté', 'Entretien P2', 'Stocker les produits de traitement dans des contenants fermés, identifiés et sur rétention adaptée.'),
    R('Eau très chargée / embouage', 'Entretien exceptionnel', 'Réaliser un diagnostic de la qualité d’eau puis procéder au nettoyage / désembouage du réseau si nécessaire.', 3),
    R('pH hors plage', 'Entretien P2', 'Corriger le conditionnement du circuit afin de ramener le pH dans la plage compatible avec les matériaux de l’installation.'),
    R('Teneur en fer élevée', 'Entretien / travaux', 'Rechercher l’origine de la corrosion, réaliser un nettoyage du réseau et adapter le traitement d’eau.', 3),
  ],
  'Chauffage - Bac de rétention': [
    R('Sous-dimensionné', 'Travaux de conformité', 'Mettre en place une rétention de capacité adaptée aux volumes de produits stockés.', 3),
    R('Dégradé / non étanche', 'Entretien / P3', 'Remplacer le bac de rétention dégradé afin de garantir son étanchéité.'),
  ],
  'Conduit de fumées - Type': [
    R('Corrosion', 'Travaux P3', 'Contrôler le conduit de fumées et remplacer les éléments présentant une corrosion avancée.', 3),
    R('Défaut d’étanchéité', 'Sécurité / P3', 'Faire contrôler l’étanchéité du conduit de fumées et reprendre les assemblages défectueux.'),
    R('Condensats / coulures', 'Entretien / P3', 'Rechercher l’origine des condensations anormales et remettre en état le conduit et son évacuation des condensats.'),
    R('Trappe de visite inaccessible', 'Entretien P2', 'Rendre accessible la trappe de visite / ramonage du conduit de fumées.'),
    R('Ramonage non justifié', 'Entretien réglementaire', 'Faire réaliser le contrôle / ramonage du conduit de fumées et consigner l’intervention.'),
  ],
  'Conduit de fumées - Section': [
    R('Dimensionnement non justifié', 'Études / conformité', 'Faire vérifier le dimensionnement du conduit de fumées par rapport aux caractéristiques des générateurs installés.', 3),
  ],
  'Conduit de fumées - Thermomètre': [
    R('Hors service', 'Entretien P2', 'Remplacer le thermomètre de fumées défectueux.'),
    R('Illisible', 'Entretien P2', 'Remplacer ou remettre en état le dispositif de mesure de température des fumées.'),
  ],
  'Soupapes - Nb': [
    R('Soupape hors service', 'Sécurité chauffage', 'Remplacer la soupape de sécurité défectueuse par un dispositif adapté aux caractéristiques de l’installation.'),
    R('Soupape isolable', 'Travaux de conformité', 'Supprimer tout organe permettant d’isoler la soupape de sécurité du générateur ou du réseau protégé.'),
    R('Contrôle périodique non justifié', 'Entretien P2', 'Contrôler le bon fonctionnement des soupapes de sécurité et consigner l’intervention.'),
  ],
  "Soupapes - Canalisation d'évacuation": [
    R('Non raccordée', 'Travaux d’amélioration', 'Canaliser le rejet de la soupape vers un point d’évacuation adapté, visible et sécurisé.'),
    R('Rejet dangereux', 'Sécurité chauffage', 'Modifier l’évacuation de la soupape afin d’éviter tout risque de brûlure pour les intervenants.'),
  ],
  'Soupapes - Pression de tarage': [
    R('Tarage illisible', 'Entretien / P3', 'Remplacer ou identifier clairement la soupape afin de connaître sa pression de tarage.'),
    R('Tarage incohérent', 'Travaux de conformité', 'Remplacer la soupape par un modèle dont la pression de tarage est compatible avec la pression admissible du générateur et du réseau.'),
  ],

  // -------------------------------------------------------------------------
  // CONF. ECS
  // -------------------------------------------------------------------------
  'ECS - Type de disconnection': [
    R('Hors service', 'Travaux de conformité', 'Remplacer ou remettre en état le dispositif de protection antipollution sur l’alimentation EF de la production ECS.'),
    R('Fuite', 'Entretien / P3', 'Réparer ou remplacer le disconnecteur présentant une fuite.'),
    R('Inaccessible', 'Entretien P2', 'Rendre accessible le dispositif de disconnexion afin de permettre son contrôle et sa maintenance.'),
  ],
  "ECS - Compteur d'eau: Présence": [
    R('Hors service', 'Travaux d’amélioration', 'Remplacer ou remettre en état le compteur d’alimentation en eau froide de la production ECS.', 3),
    R('Index illisible', 'Travaux d’amélioration', 'Remplacer le compteur dont l’index n’est plus lisible afin de rétablir le suivi des consommations ECS.', 3),
    R('Inaccessible', 'Entretien P2', 'Rendre le compteur ECS accessible pour permettre son relevé périodique.'),
  ],
  'ECS - Type': [
    R('Absent alors que nécessaire', 'Travaux d’amélioration', 'Mettre en place un traitement d’eau adapté à la qualité de l’eau et aux caractéristiques de l’installation ECS.', 6),
  ],
  'ECS - Etat': [
    R('Dégradé', 'Entretien / P3', 'Réviser le système de traitement ECS et remplacer les composants dégradés.'),
    R('Fuite', 'Entretien P2', 'Supprimer la fuite sur le système de traitement ECS et contrôler son fonctionnement.'),
  ],
  'ECS - Niveau de produit': [
    R('Produit vide', 'Entretien P2', 'Remettre le système de traitement en service, compléter le produit et contrôler le dosage.'),
    R('Produit non identifié', 'Entretien P2', 'Identifier et étiqueter clairement le produit de traitement utilisé sur l’installation ECS.'),
  ],
  'ECS - Bac de rétention': [
    R('Sous-dimensionné', 'Travaux de conformité', 'Adapter la capacité du bac de rétention aux volumes de produits stockés.', 3),
    R('Dégradé / non étanche', 'Entretien / P3', 'Remplacer le bac de rétention dégradé.'),
  ],
  "ECS - Emplacement du point d'injection": [
    R('Mal positionné', 'Travaux d’amélioration', 'Repositionner le point d’injection du traitement afin d’assurer une diffusion correcte du produit et d’éviter les zones de concentration.', 3),
    R('Fuite / corrosion', 'Entretien / P3', 'Remettre en état le point d’injection et remplacer les éléments présentant une fuite ou une corrosion.'),
  ],
  'Manchettes témoin: Départ ECS': [
    R('Corrosion importante', 'Entretien / diagnostic', 'Remplacer la manchette témoin et analyser l’origine de la corrosion constatée.', 3),
    R('Contrôle non réalisé', 'Entretien P2', 'Déposer et contrôler la manchette témoin puis consigner son état dans le carnet sanitaire.', 3),
  ],
  'Manchettes témoin: Bouclage ECS': [
    R('Corrosion importante', 'Entretien / diagnostic', 'Remplacer la manchette témoin et analyser l’origine de la corrosion constatée.', 3),
    R('Contrôle non réalisé', 'Entretien P2', 'Déposer et contrôler la manchette témoin puis consigner son état dans le carnet sanitaire.', 3),
  ],
  'Manchettes témoin: Eau froide': [
    R('Corrosion importante', 'Entretien / diagnostic', 'Remplacer la manchette témoin et analyser l’origine de la corrosion constatée.', 3),
    R('Contrôle non réalisé', 'Entretien P2', 'Déposer et contrôler la manchette témoin puis consigner son état dans le carnet sanitaire.', 3),
  ],
  "Trou d'homme sur ballon ECS": [
    R('Inaccessible', 'Entretien P2', 'Dégager l’accès au trou d’homme du ballon afin de permettre les opérations d’inspection et de nettoyage.'),
    R('Fuite au joint', 'Entretien / P3', 'Remplacer le joint du trou d’homme et contrôler l’étanchéité après remontage.'),
  ],
  'Vanne de vidange sur ballon': [
    R('Grippée / HS', 'Entretien / P3', 'Remplacer ou remettre en état la vanne de vidange du ballon ECS.'),
    R('Inaccessible', 'Entretien P2', 'Rendre la vanne de vidange accessible aux opérations de maintenance.'),
  ],
  'Carnet sanitaire': [
    R('Non tenu à jour', 'Entretien P2', 'Mettre à jour le carnet sanitaire avec les relevés de température, analyses et opérations d’entretien réalisées.'),
    R('Relevés de température incomplets', 'Entretien P2', 'Compléter et consigner régulièrement les relevés des températures de production, stockage, départ et bouclage ECS.'),
    R('Analyses non disponibles', 'Exploitation', 'Fournir et archiver dans le carnet sanitaire les derniers résultats d’analyses et de surveillance de l’ECS.'),
  ],
  'Robinet de prélèvement (départ, bouclage et EF)': [
    R('Inaccessibles', 'Entretien P2', 'Rendre accessibles et clairement identifier les différents points de prélèvement ECS.'),
    R('Fuite / HS', 'Entretien P2', 'Remettre en état ou remplacer les robinets de prélèvement défectueux.'),
    R('Non identifiés', 'Entretien P2', 'Repérer clairement chaque robinet de prélèvement : EF, départ ECS et retour bouclage.'),
  ],
  'Soupape': [
    R('Hors service', 'Sécurité / P3', 'Remplacer la soupape de sécurité ECS défectueuse.'),
    R('Fuite permanente', 'Entretien / diagnostic', 'Contrôler la pression du réseau, le vase d’expansion sanitaire et la soupape puis supprimer l’écoulement permanent.'),
    R('Évacuation dangereuse', 'Travaux de conformité', 'Canaliser le rejet de la soupape vers une évacuation adaptée afin d’éviter tout risque de brûlure.'),
    R('Ballon - corrosion extérieure', 'Diagnostic / P3', 'Contrôler l’état du ballon, rechercher l’origine de la corrosion et traiter ou remplacer les éléments dégradés.', 3),
    R('Ballon - fuite', 'P3', 'Rechercher l’origine de la fuite sur le stockage ECS et procéder à la réparation ou au remplacement nécessaire.'),
    R('Ballon - calorifuge dégradé', 'Travaux d’amélioration', 'Reprendre le calorifuge du ballon et des accessoires afin de limiter les pertes thermiques.', 6),
  ],

  // -------------------------------------------------------------------------
  // CONF. ADOUCISSEUR
  // -------------------------------------------------------------------------
  'Adoucisseur - Type': [
    R('Inadapté au débit', 'Études / P3', 'Vérifier le dimensionnement de l’adoucisseur et prévoir son remplacement ou son adaptation si sa capacité est insuffisante au regard des besoins de l’installation.', 6),
    R('Simplex / continuité nécessaire', 'Travaux d’amélioration', 'Étudier la mise en place d’une configuration duplex ou d’une solution garantissant la continuité de traitement pendant les régénérations.', 12),
  ],
  'Adoucisseur - Etat': [
    R('Fuite', 'Entretien / P3', 'Rechercher et supprimer la fuite sur l’adoucisseur puis contrôler son fonctionnement après intervention.'),
    R('Corrosion', 'P3', 'Traiter ou remplacer les éléments présentant une corrosion avancée et vérifier l’étanchéité de l’installation.', 3),
    R('Régénération défaillante', 'Entretien P2', 'Contrôler le cycle de régénération, les organes de commande et la vanne de tête puis remettre l’adoucisseur en fonctionnement normal.'),
    R('Programmation incorrecte', 'Entretien P2', 'Reprendre les paramètres de régénération en fonction de la dureté d’eau, de la capacité des résines et de la consommation réelle.'),
    R('Résines / efficacité insuffisante', 'Entretien / P3', 'Contrôler la capacité d’échange des résines et prévoir leur remplacement ou leur régénération si leurs performances sont insuffisantes.', 3),
    R('TH sortie trop élevé', 'Entretien P2', 'Contrôler le fonctionnement de l’adoucisseur, le réglage du mélange et la régénération afin d’obtenir la dureté cible en sortie.'),
    R('TH sortie trop faible', 'Entretien P2', 'Reprendre le réglage du mélange afin d’éviter une eau excessivement adoucie et respecter la dureté cible définie pour l’installation.'),
    R('Évacuation régénération inadaptée', 'Travaux de conformité', 'Créer ou reprendre l’évacuation des eaux de régénération vers un réseau adapté, avec dispositif empêchant tout retour d’eau.', 3),
    R('Flexible évacuation déboîté / fuite', 'Entretien P2', 'Refixer ou remplacer le flexible d’évacuation des eaux de régénération et contrôler l’absence de fuite.'),
    R('Trop-plein bac à sel non raccordé', 'Travaux d’amélioration', 'Raccorder le trop-plein du bac à sel vers une évacuation adaptée afin de limiter le risque d’inondation.', 3),
    R('Alimentation électrique défectueuse', 'Entretien électrique', 'Remettre en état l’alimentation électrique de l’adoucisseur et vérifier le fonctionnement de la programmation.'),
    R('Compteur / turbine de commande HS', 'Entretien / P3', 'Remettre en état le dispositif de mesure pilotant les régénérations volumétriques.'),
    R('Entretien sanitaire non justifié', 'Entretien P2', 'Procéder au nettoyage et à la désinfection de l’adoucisseur puis consigner l’intervention dans le suivi d’exploitation.'),
    R('Absence de relevé TH', 'Entretien P2', 'Mettre en place un suivi périodique de la dureté de l’eau en amont et en aval de l’adoucisseur.'),
  ],
  'Adoucisseur - Niveau de sel': [
    R('Bac vide', 'Entretien P2', 'Réapprovisionner le bac à sel et contrôler le bon déroulement de la régénération suivante.'),
    R('Pont de sel', 'Entretien P2', 'Casser le pont de sel, nettoyer le bac si nécessaire et vérifier l’aspiration de saumure lors de la régénération.'),
    R('Bac très encrassé', 'Entretien P2', 'Nettoyer et désinfecter le bac à sel avant remise en service.'),
    R('Sel inadapté / pollué', 'Entretien P2', 'Vidanger le produit non conforme et approvisionner un sel adapté à l’adoucissement de l’eau.'),
  ],
  'Adoucisseur - Filtre / Bypass': [
    R('Filtre encrassé', 'Entretien P2', 'Nettoyer ou remplacer la cartouche ou l’élément filtrant situé en amont de l’adoucisseur.'),
    R('Filtre HS / fuite', 'Entretien / P3', 'Remettre en état ou remplacer le filtre amont défectueux.'),
    R('Vannes bypass grippées', 'Entretien / P3', 'Remettre en état ou remplacer les vannes du bypass afin de garantir l’isolement de l’adoucisseur lors des opérations de maintenance.'),
    R('Bypass mauvaise position', 'Entretien P2', 'Repositionner les vannes du bypass dans leur configuration normale de fonctionnement et vérifier le traitement de l’eau en sortie.'),
    R('Bypass non repéré', 'Entretien P2', 'Identifier clairement les vannes entrée, sortie et bypass afin d’éviter toute erreur de manœuvre.'),
  ],
};

export function fusionnerPrescriptions(base = {}) {
  const resultat = { ...base };
  for (const [cle, ajouts] of Object.entries(RESERVE_EXTENSIONS)) {
    const existantes = resultat[cle] || [];
    const signatures = new Set(existantes.map((x) => `${(x.critere || '').trim().toLowerCase()}||${(x.prestation || '').trim().toLowerCase()}`));
    const nouvelles = ajouts.filter((x) => !signatures.has(`${(x.critere || '').trim().toLowerCase()}||${(x.prestation || '').trim().toLowerCase()}`));
    resultat[cle] = [...existantes, ...nouvelles];
  }
  return resultat;
}
