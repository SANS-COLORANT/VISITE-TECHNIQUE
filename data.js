/** Référentiel de la trame + bibliothèque de préconisations — généré depuis Trame_ICPE.xlsx. */

// ============================================================================
// 1. RÉFÉRENTIEL DE LA TRAME (généré depuis Trame_ICPE.xlsx)
// ============================================================================

const TRAME_DATA = {
  "p-infos": {
    "Général": [
      { cle: "Nom du client", type: "champ" },
      { cle: "Nom du site", type: "champ" },
      { cle: "Nom du local", type: "champ" },
      { cle: "Trame utilisée", type: "champ" },
      { cle: "Date de la visite", type: "champ" },
    ],
    "Informations générales": [
      { cle: "Date de visite", type: "champ" },
      { cle: "Heure de visite", type: "champ" },
      { cle: "Nom du site", type: "champ" },
      { cle: "Adresse", type: "champ" },
      { cle: "Nbr de bât / lgt", type: "champ" },
      { cle: "Energie - pression", type: "champ" },
      { cle: "Exploitant - marché", type: "champ" },
      { cle: "Type de LT", type: "champ" },
    ],
    "Description des principaux équipements": [
      { cle: "Production primaire", type: "champ" },
      { cle: "Nb d'équipements", type: "champ" },
      { cle: "Puissance totale installée (kW)", type: "champ" },
      { cle: "Type de régulation", type: "champ" },
      { cle: "Production ECS", type: "champ" },
      { cle: "Puissance, volume, nb de plaques...", type: "champ" },
      { cle: "Nb d'équipements (ECS)", type: "champ" },
    ],
  },
  "p-distrib": {
    "Distribution chauffage": [
      { cle: "Matériaux tuyauterie", type: "champ" },
      { cle: "Type de distribution", type: "champ" },
      { cle: "Equipement sur aller", type: "champ" },
      { cle: "Equipement sur retour", type: "champ" },
      { cle: "Type d'émetteur", type: "champ" },
      { cle: "Type de robinetterie", type: "champ" },
      { cle: "Calorifuge (type / état)", type: "champ" },
      { cle: "Variation de vitesse", type: "champ" },
    ],
    "Distribution ECS": [
      { cle: "Matériaux tuyauterie", type: "champ" },
      { cle: "Type de distribution", type: "champ" },
      { cle: "Equipement sur aller", type: "champ" },
      { cle: "Equipement sur retour", type: "champ" },
      { cle: "Calorifuge (type / état)", type: "champ" },
      { cle: "Présence mitigeur", type: "champ" },
    ],
  },
  "p-regulation": {
    "Cascade chaudières": [
      { cle: "Paramètres cascade chaudières", type: "champ" },
      { cle: "T°ext(°C)", type: "champ" },
      { cle: "T°dép(°C)", type: "champ" },
    ],
    "Réseau ECS": [
      { cle: "T° consigne (°C)", type: "champ" },
      { cle: "Cycle anti-légionellose", type: "champ" },
    ],
  },
  "p-releves": {
    "Relevés des compteurs et manomètres": [
      { cle: "Index compteur(s) gaz(m³)/Cuve fioul (litres ou %)", type: "champ" },
      { cle: "Index compteur énergie (MWh)", type: "champ" },
      { cle: "Index compteur d’appoint eau chauffage (m³)", type: "champ" },
      { cle: "Index compteur alimentation EF ECS (m³)", type: "champ" },
      { cle: "Pression réseau de chauffage (bar)", type: "champ" },
      { cle: "Pression réseau d’ECS (bar)", type: "champ" },
    ],
    "Températures et pH": [
      { cle: "pH", type: "controle" },
      { cle: "PRIMAIRE: T° départ (°C)", type: "controle" },
      { cle: "PRIMAIRE: T° retour (°C)", type: "controle" },
      { cle: "CHAUFFAGE: T° départ (°C)", type: "controle" },
      { cle: "CHAUFFAGE: T° retour (°C)", type: "controle" },
      { cle: "EAU CHAUDE SANITAIRE: T° départ (°C) ", type: "controle" },
      { cle: "EAU CHAUDE SANITAIRE: T° retour (°C)", type: "controle" },
      { cle: "EAU CHAUDE SANITAIRE: T° stockage (°C)", type: "controle" },
    ],
  },
  "p-conf-local": {
    "Partie local": [
      { cle: "Situation", type: "controle" },
      { cle: "Accessibilité", type: "controle" },
      { cle: "Issue de secours", type: "controle" },
    ],
    "Portes d'accès": [
      { cle: "Nb", type: "champ" },
      { cle: "Sens d'ouverture", type: "controle" },
      { cle: "Degré coupe-feu", type: "controle" },
      { cle: "Barre anti panique", type: "controle" },
      { cle: "Ferme porte", type: "controle" },
      { cle: "Repérage chaufferie", type: "controle" },
    ],
    "Ventilation": [
      { cle: "Ventilation basse", type: "controle" },
      { cle: "Ventilation haute", type: "controle" },
      { cle: "Emplacements", type: "controle" },
      { cle: "Section", type: "controle" },
    ],
    "Lutte contre l'incendie": [
      { cle: "Extincteurs: Nombre", type: "controle" },
      { cle: "Extincteurs: Type", type: "controle" },
      { cle: "Extincteurs: Signalétique", type: "controle" },
      { cle: "Gaine pompiers: Présence", type: "controle" },
      { cle: "Gaine pompiers: Signalétiques", type: "controle" },
      { cle: "Gaine pompiers: Raccord ZAG & tampon", type: "controle" },
      { cle: "Détection gaz: Présence", type: "controle" },
      { cle: "Détection gaz: Nb cellules", type: "controle" },
      { cle: "Détection incendie: Présence", type: "controle" },
      { cle: "Détection incendie: Nb cellules", type: "controle" },
      { cle: "Désenfumage: Présence", type: "controle" },
      { cle: "Désenfumage: Nb déclencheurs", type: "controle" },
      { cle: "Désenfumage: DM / accès", type: "controle" },
      { cle: "Alarme sonore: Présence", type: "controle" },
      { cle: "Alarme sonore: Nb sirènes", type: "controle" },
      { cle: "Alarme visuelle: Présence", type: "controle" },
      { cle: "Alarme visuelle: Nb gyrophares", type: "controle" },
      { cle: "Degré coupe-feu des parois", type: "controle" },
      { cle: "Bac à sable + pelle (fioul & bois)", type: "controle" },
      { cle: "Sprinkler (bois)", type: "controle" },
    ],
    "Affichages réglementaires": [
      { cle: "Consignes de sécurité", type: "controle" },
      { cle: "Plan de sécurité", type: "controle" },
      { cle: "Schéma hydraulique à jour", type: "controle" },
    ],
    "Evacuations des EU du local": [
      { cle: "Type", type: "controle" },
      { cle: "Etat", type: "controle" },
      { cle: "Traitement des condensats", type: "controle" },
      { cle: "Caillebotis", type: "controle" },
    ],
    "Autres": [
      { cle: "Robinet de puisage: Présence", type: "controle" },
      { cle: "Robinet de puisage: Emplacement", type: "controle" },
      { cle: "Robinet de puisage: Clapet HA", type: "controle" },
    ],
  },
  "p-conf-energie": {
    "Coupure extérieure combustible": [
      { cle: "Présence à chaque accès", type: "controle" },
      { cle: "Type (2 électrovannes minimum)", type: "controle" },
      { cle: "Coffret", type: "controle" },
      { cle: "Verre dormant", type: "controle" },
      { cle: "Signalétique \"Coupure combustible extérieure\"", type: "controle" },
    ],
    "Coupure extérieure électrique": [
      { cle: "Présence à chaque accès", type: "controle" },
      { cle: "Coffret", type: "controle" },
      { cle: "Verre dormant", type: "controle" },
      { cle: "Signalétique \"Coupure électrique extérieure\"", type: "controle" },
      { cle: "Séparation Force/Lumière/Relevage", type: "controle" },
      { cle: "Signalétique Force/Lumière/Relevage", type: "controle" },
    ],
    "Ligne alimentation gaz": [
      { cle: "Vanne gaz / chaudière", type: "controle" },
      { cle: "Filtre / chaudière", type: "controle" },
      { cle: "Pressostats / chaudière", type: "controle" },
      { cle: "Manomètre gaz", type: "controle" },
      { cle: "Compteur gaz (1/chaudière si Pu > 1 MW)", type: "controle" },
    ],
    "Armoire électrique": [
      { cle: "Nb", type: "champ" },
      { cle: "Schéma électrique", type: "controle" },
      { cle: "Câblage", type: "controle" },
      { cle: "Protection", type: "controle" },
      { cle: "Espace libre suffisant (≥ 30 %)", type: "controle" },
      { cle: "Eclairage", type: "controle" },
      { cle: "Prise 220V protégée 30 mA", type: "controle" },
    ],
    "BAES": [
      { cle: "Nb", type: "champ" },
      { cle: "Présence", type: "controle" },
      { cle: "Visible partout", type: "controle" },
      { cle: "Signalétique", type: "controle" },
      { cle: "Veilleuse", type: "controle" },
    ],
    "Autres": [
      { cle: "Eclairage", type: "controle" },
      { cle: "Chemins de câbles électriques avec liaison équipotentiel", type: "controle" },
      { cle: "Etat du local", type: "controle" },
      { cle: "Calorifuge", type: "controle" },
    ],
  },
  "p-conf-chauffage": {
    "Disconnection et alimentation eau froide": [
      { cle: "Type de disconnection", type: "controle" },
      { cle: "Compteur d'eau: Présence", type: "controle" },
      { cle: "Compteur d'eau: Emplacement", type: "controle" },
    ],
    "Traitement d'eau": [
      { cle: "Type de filtration", type: "controle" },
      { cle: "Pot d'introduction", type: "controle" },
      { cle: "Produit de traitement", type: "controle" },
      { cle: "Bac de rétention", type: "controle" },
    ],
    "Conduits de fumées": [
      { cle: "Nb", type: "champ" },
      { cle: "Type", type: "controle" },
      { cle: "Section", type: "controle" },
      { cle: "Thermomètre", type: "controle" },
    ],
    "Soupapes": [
      { cle: "Nb", type: "champ" },
      { cle: "Canalisation d'évacuation", type: "controle" },
      { cle: "Pression de tarage", type: "controle" },
    ],
  },
  "p-conf-ecs": {
    "Disconnection et alimentation eau froide": [
      { cle: "Type de disconnection", type: "controle" },
      { cle: "Compteur d'eau: Présence", type: "controle" },
      { cle: "Compteur d'eau: Emplacement", type: "controle" },
    ],
    "Traitement": [
      { cle: "Type", type: "controle" },
      { cle: "Etat", type: "controle" },
      { cle: "Bac de rétention", type: "controle" },
      { cle: "Niveau de produit", type: "controle" },
      { cle: "Emplacement du point d'injection", type: "controle" },
    ],
    "Autres": [
      { cle: "Manchettes témoin: Départ ECS", type: "controle" },
      { cle: "Manchettes témoin: Bouclage ECS", type: "controle" },
      { cle: "Manchettes témoin: Eau froide", type: "controle" },
      { cle: "Trou d'homme sur ballon ECS", type: "controle" },
      { cle: "Vanne de vidange sur ballon", type: "controle" },
      { cle: "Carnet sanitaire", type: "controle" },
      { cle: "Robinet de prélèvement (départ, bouclage et EF)", type: "controle" },
      { cle: "Soupape", type: "controle" },
    ],
  },
  "p-conf-adouc": {
    "Réseau(x) alimenté(s)": [
      { cle: "Type", type: "controle" },
      { cle: "Etat", type: "controle" },
      { cle: "Niveau de sel", type: "controle" },
      { cle: "Filtre / Bypass", type: "controle" },
    ],
  },
};

const RESEAU_TEMPLATE = [
  { cle: "T°ext(°C)", type: "champ" },
  { cle: "T°dép(°C)", type: "champ" },
  { cle: "Nom réseau", type: "champ" },
  { cle: "Courbe de chauffe", type: "champ" },
  { cle: "TNC", type: "champ" },
  { cle: "Consigne et Programme horaire", type: "champ" },
];

const PRESCRIPTIONS = {
  "pH": [
    { critere: null, poste: "Entretien P2", prestation: "Conditionner le circuit pour atteindre la valeur de pH \"cible\"", delai: 1, estimatif: null },
  ],
  "EAU CHAUDE SANITAIRE: T° départ (°C)": [
    { critere: "Brûl", poste: "Entretien P2", prestation: "Diminuer la température de départ ECS entre 58°C et 60°C pour éviter les risques de brûlures et préserver le circuit ECS", delai: 1, estimatif: null },
    { critere: "Elev", poste: "Entretien P2", prestation: "Diminuer la température de départ ECS entre 58°C et 60°C pour éviter les risques de brûlures et préserver le circuit ECS", delai: 1, estimatif: null },
    { critere: "Haut", poste: "Entretien P2", prestation: "Diminuer la température de départ ECS entre 58°C et 60°C pour éviter les risques de brûlures et préserver le circuit ECS", delai: 1, estimatif: null },
    { critere: "Bas", poste: "Entretien P2", prestation: "Augmenter la température de départ ECS entre 58°C et 60°C pour limiter les risques de prolifération de la légionellose", delai: 1, estimatif: null },
    { critere: "Thermo", poste: "Travaux d'amélioration", prestation: "Mettre en place un thermomètre sur le départ ECS", delai: 3, estimatif: 230.0 },
  ],
  "EAU CHAUDE SANITAIRE: T° retour (°C)": [
    { critere: "Bas", poste: "Entretien P2", prestation: "Revoir la consigne de départ ECS et contrôler la distribution pour obtenir un retour ECS supérieur à 50°C", delai: 1, estimatif: null },
    { critere: "Thermo", poste: "Travaux d'amélioration", prestation: "Mettre en place un thermomètre sur le retour ECS", delai: 3, estimatif: 230.0 },
    { critere: "Légio", poste: "Entretien P2", prestation: "Revoir la consigne de départ ECS et contrôler la distribution pour obtenir un retour ECS supérieur à 50°C", delai: 1, estimatif: null },
  ],
  "EAU CHAUDE SANITAIRE: T° stockage (°C)": [
    { critere: "Bas", poste: "Entretien P2", prestation: "Augmenter la température de stockage dans le ballon ECS (> 60°C en présence d'un mitigeage sur le départ)", delai: 1, estimatif: null },
    { critere: "Thermo", poste: "Travaux d'amélioration", prestation: "Mettre en place un thermomètre sur le ballon ECS", delai: 3, estimatif: 230.0 },
  ],
  "Issue de secours": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Créer une issue de secours (idéalement à l'opposé de la porte d'accès à la chaufferie)", delai: 12, estimatif: 6500.0 },
    { critere: "Condamn", poste: "Travaux de conformité", prestation: "Rendre l'issue de secours accessible", delai: 3, estimatif: 500.0 },
    { critere: "Encombr", poste: "Entretien P2", prestation: "Rendre l'issue de secours accessible", delai: 1, estimatif: null },
  ],
  "Sens d'ouverture": [
    { critere: null, poste: "Travaux de conformité", prestation: "Inverser le sens d'ouverture de la porte d'accès (vers l'extérieur)", delai: 1, estimatif: 1200.0 },
  ],
  "Degré coupe-feu": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Récupérer le PV coupe-feu de la porte", delai: 3, estimatif: null },
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Remplacer la porte d'accès par une porte d'accès avec le degré coupe-feu réglementaire", delai: 12, estimatif: 2400.0 },
  ],
  "Barre anti panique": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place une barre anti-panique sur la porte d'accès", delai: 12, estimatif: 800.0 },
    { critere: "Dégrad", poste: "Travaux de conformité", prestation: "Remettre en état la barre anti-panique sur la porte d'accès", delai: 12, estimatif: 800.0 },
    { critere: "Hors service", poste: "Travaux de conformité", prestation: "Remettre en état la barre anti-panique sur la porte d'accès", delai: 12, estimatif: 800.0 },
  ],
  "Ferme porte": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place un ferme-porte sur la porte d'accès", delai: 12, estimatif: 800.0 },
    { critere: "Dégrad", poste: "Travaux de conformité", prestation: "Remettre en état le ferme-porte sur la porte d'accès", delai: 12, estimatif: 800.0 },
    { critere: "Hors service", poste: "Travaux de conformité", prestation: "Remettre en état le ferme-porte sur la porte d'accès", delai: 12, estimatif: 800.0 },
  ],
  "Repérage chaufferie": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter une signalétique \"chaufferie gaz\" sur la porte d'accès", delai: 3, estimatif: 100.0 },
  ],
  "Ventilation basse": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Agrandir la ventilation basse à la section réglementaire", delai: 3, estimatif: 1200.0 },
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Créer une ventilation basse", delai: 3, estimatif: 2500.0 },
  ],
  "Ventilation haute": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Agrandir la ventilation haute à la section réglementaire", delai: 3, estimatif: 1200.0 },
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Créer une ventilation haute", delai: 3, estimatif: 2500.0 },
  ],
  "Emplacements": [
    { critere: null, poste: "Travaux de conformité", prestation: "Revoir l'emplacement des ventilations", delai: 12, estimatif: 3500.0 },
  ],
  "Extincteurs: Nombre": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place un extincteur", delai: 3, estimatif: 100.0 },
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Mettre en place un extincteur complémentaire", delai: 3, estimatif: 100.0 },
  ],
  "Extincteurs: Type": [
    { critere: null, poste: "Travaux de conformité", prestation: "Remplacer les extincteurs par des extincteurs adaptés au type de feu", delai: 3, estimatif: 100.0 },
  ],
  "Extincteurs: Signalétique": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place une signalétique \"Ne pas utiliser sur la flamme gaz\" au-dessus de l'extincteur", delai: 3, estimatif: 100.0 },
  ],
  "Gaine pompiers: Présence": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place une gaine pompier", delai: 12, estimatif: 2500.0 },
  ],
  "Gaine pompiers: Signalétiques": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place une signalétique \"gaine pompier\"", delai: 3, estimatif: 100.0 },
  ],
  "Gaine pompiers: Raccord ZAG & tampon": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place un raccord ZAG conforme à la réglementation sur la gaine pompier", delai: 12, estimatif: 250.0 },
  ],
  "Détection gaz: Présence": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place une détection gaz (chaufferie > 1 MW)", delai: 6, estimatif: 6500.0 },
  ],
  "Détection gaz: Nb cellules": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Ajouter des cellules sur la détection gaz", delai: 3, estimatif: 1200.0 },
  ],
  "Détection incendie: Présence": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place une détection incendie (chaufferie > 1 MW en sous-sol )", delai: 6, estimatif: 6500.0 },
  ],
  "Détection incendie: Nb cellules": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Ajouter des cellules sur la détection incendie", delai: 3, estimatif: 1200.0 },
  ],
  "Désenfumage: Présence": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place un système de désenfumage", delai: 12, estimatif: 8500.0 },
  ],
  "Désenfumage: Nb déclencheurs": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Revoir le nombre de déclencheur sur le système de désenfumage", delai: 6, estimatif: 1500.0 },
  ],
  "Alarme sonore: Présence": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place une alarme sonore par accès", delai: 6, estimatif: 1200.0 },
  ],
  "Alarme sonore: Nb sirènes": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Ajouter une sirène sur la deuxième issue", delai: 6, estimatif: 600.0 },
  ],
  "Alarme visuelle: Présence": [
    { critere: null, poste: "Travaux de conformité", prestation: "Mettre en place une alarme visuelle par accès", delai: 6, estimatif: 1200.0 },
  ],
  "Alarme visuelle: Nb gyrophares": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Ajouter un gyrophare sur la deuxième issue", delai: 6, estimatif: 600.0 },
  ],
  "Degré coupe-feu des parois": [
    { critere: "Flocage", poste: "Travaux de conformité", prestation: "Floquer le plafond de la chaufferie avec un matériau coupe-feu 2h", delai: 6, estimatif: 4500.0 },
  ],
  "Bac à sable + pelle (fioul & bois)": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Installer un bac à sable avec une pelle", delai: 6, estimatif: 800.0 },
  ],
  "Sprinkler (bois)": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Installer un système de sprinklage sur la chaudière bois", delai: 6, estimatif: 4500.0 },
  ],
  "Consignes de sécurité": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Afficher les consignes de sécurité", delai: 3, estimatif: 100.0 },
    { critere: "Non adapt", poste: "Travaux de conformité", prestation: "Afficher des consignes de sécurité cohérentes avec les risques en chaufferie", delai: 3, estimatif: 100.0 },
  ],
  "Plan de sécurité": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Créer et afficher le plan de sécurité", delai: 3, estimatif: 600.0 },
    { critere: "Non à jour", poste: "Travaux de conformité", prestation: "Modifier et afficher un plan de sécurité à jour", delai: 3, estimatif: 600.0 },
    { critere: "Obsol", poste: "Travaux de conformité", prestation: "Modifier et afficher un plan de sécurité à jour", delai: 3, estimatif: 600.0 },
  ],
  "Schéma hydraulique à jour": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Créet et afficher le schéma de principe", delai: 3, estimatif: 600.0 },
    { critere: "Non à jour", poste: "Travaux de conformité", prestation: "Modifier et afficher le schéma de principe à jour", delai: 3, estimatif: 600.0 },
    { critere: "Obsol", poste: "Travaux de conformité", prestation: "Modifier et afficher le schéma de principe à jour", delai: 3, estimatif: 600.0 },
  ],
  "Evacuations des EU - Type": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Créer une évacuation des eaux", delai: 9, estimatif: 3500.0 },
  ],
  "Evacuations des EU - Etat": [
    { critere: "Nettoy", poste: "Entretien P2", prestation: "Nettoyer l'évacuation pour garantir l'écoulement des EU", delai: 1, estimatif: null },
  ],
  "Evacuations des EU - Condensats": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un bac de neutralisation des condensats (présence d'une chaudière à condensation)", delai: 3, estimatif: 850.0 },
  ],
  "Evacuations des EU - Caillebotis": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un caillebotis sur le puisard d'évacuation des EU", delai: 3, estimatif: 700.0 },
  ],
  "Robinet de puisage: Présence": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un robinet de puisage sur l'eau froide", delai: 6, estimatif: 280.0 },
  ],
  "Robinet de puisage: Emplacement": [
    { critere: "Modifi", poste: "Travaux de conformité", prestation: "Modifier l'emplacement du robinet de puisage sur l'eau froide", delai: 6, estimatif: 280.0 },
  ],
  "Robinet de puisage: Clapet HA": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un clapet HA sur le robinet de puisage sur l'eau froide", delai: 6, estimatif: 30.0 },
  ],
  "Coupure combustible - Présence": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter une coupure extérieure du combustible dans un coffret adapté", delai: 3, estimatif: 1800.0 },
  ],
  "Coupure combustible - Type": [
    { critere: "Double électrovanne", poste: "Travaux de conformité", prestation: "Ajouter une double électrovanne (à l'extérieure la chaufferie)", delai: 9, estimatif: 2600.0 },
    { critere: "Vanne gaz", poste: "Travaux de conformité", prestation: "Remplacer la vanne de coupure combustible par une vanne gaz normalisée", delai: 1, estimatif: 550.0 },
  ],
  "Coupure combustible - Coffret": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un coffret sur la vanne de coupure extérieure du combustible", delai: 6, estimatif: 350.0 },
    { critere: "Dégrad", poste: "Travaux de conformité", prestation: "Remplacer le coffret sur la vanne de coupure extérieure du combustible", delai: 6, estimatif: 350.0 },
  ],
  "Coupure combustible - Verre dormant": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place un verre dormant sur le coffret de coupure extérieure du combustible", delai: 1, estimatif: null },
    { critere: "Cassé", poste: "Travaux de conformité", prestation: "Remplacer le verre dormant sur le coffret de coupure extérieure du combustible", delai: 1, estimatif: null },
  ],
  "Coupure combustible - Signalétique": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre une signalétique \"Coupure gaz extérieure\" sur ou près du coffret", delai: 3, estimatif: null },
  ],
  "Coupure électrique - Présence": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter une coupure extérieure électrique dans un coffret adapté", delai: 3, estimatif: 850.0 },
  ],
  "Coupure électrique - Coffret": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un coffret sur la vanne de coupure extérieure électrique", delai: 6, estimatif: 350.0 },
    { critere: "Dégrad", poste: "Travaux de conformité", prestation: "Remplacer un coffret sur la vanne de coupure extérieure électrique", delai: 6, estimatif: 350.0 },
  ],
  "Coupure électrique - Verre dormant": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place un verre dormant sur le coffret de coupure extérieure électrique", delai: 1, estimatif: null },
    { critere: "Cassé", poste: "Travaux de conformité", prestation: "Remplacer le verre dormant sur le coffret de coupure extérieure électrique", delai: 1, estimatif: null },
  ],
  "Coupure électrique - Signalétique": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre une signalétique \"Coupure électrique extérieure\" sur le coffret", delai: 3, estimatif: null },
  ],
  "Coupure électrique - Séparation F/L/R": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Remplacement la coupure extérieure électrique en prévoyant la séparation \"Force / Lumière\"", delai: 3, estimatif: 850.0 },
  ],
  "Coupure électrique - Signalétique F/L/R": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre une signalétique \"Force / Lumière\" sur le coffret", delai: 3, estimatif: null },
  ],
  "Vanne gaz / chaudière": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter une vanne de coupure gaz par brûleur", delai: 3, estimatif: 650.0 },
  ],
  "Filtre / chaudière": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un filtre gaz sur chaque alimentation de brûleur", delai: 3, estimatif: 850.0 },
  ],
  "Pressostats / chaudière": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un pressostat gaz sur chaque alimentation de brûleur", delai: 3, estimatif: 550.0 },
  ],
  "Manomètre gaz": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Installer un manomètre gaz adapté à la pression d'alimentation", delai: 3, estimatif: 350.0 },
    { critere: "Non adapt", poste: "Travaux de conformité", prestation: "Remplacer le manomètre gaz par un manomètre adapté à la pression d'alimentation", delai: 3, estimatif: 350.0 },
  ],
  "Compteur gaz (1/chaudière si Pu > 1 MW)": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Installer un compteur gaz pour chaque chaudière > 1 MW", delai: 3, estimatif: 1500.0 },
  ],
  "Armoire - Schéma électrique": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Créer et rendre disponible le schéma électrique de l'armoire", delai: 3, estimatif: 650.0 },
    { critere: "à jour", poste: "Travaux de conformité", prestation: "Mettre à jour le schéma électrique de l'armoire", delai: 3, estimatif: 350.0 },
  ],
  "Armoire - Câblage": [
    { critere: "Dénud", poste: "Entretien P2", prestation: "Revoir le câblage de l'armoire électrique (câble dénudé)", delai: 1, estimatif: null },
    { critere: "Identifi", poste: "Travaux de conformité", prestation: "Repérer les différents câblages du bornier", delai: 3, estimatif: 350.0 },
    { critere: "Repére", poste: "Travaux de conformité", prestation: "Repérer les différents câblages du bornier", delai: 3, estimatif: 350.0 },
  ],
  "Armoire - Protection": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un dispositif de protection pour l'armoire électrique", delai: 3, estimatif: 220.0 },
    { critere: "Non adapt", poste: "Travaux de conformité", prestation: "Adapter le dispositif de protection pour l'armoire électrique (intensité du dispositif actuelle non adaptée)", delai: 3, estimatif: 220.0 },
  ],
  "Armoire - Eclairage": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Installer un éclairage dans l'armoire électrique (éclairage ambiant insuffisant)", delai: 3, estimatif: 120.0 },
  ],
  "Armoire - Prise": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter une prise électrique (220 V - protégée par un disjoncteur différentiel 30 mA)", delai: 3, estimatif: 80.0 },
  ],
  "BAES - Presence": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter un B.A.E.S au-dessus de la porte d'accès", delai: 3, estimatif: 240.0 },
  ],
  "BAES - Visibilité": [
    { critere: "Position", poste: "Travaux de conformité", prestation: "Modifier l'emplacement du B.A.E.S pour le rendre visible quel que soit la position dans le local technique", delai: 3, estimatif: 180.0 },
  ],
  "BAES - Signalétique": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Ajouter la signalétique réglementaire sur le B.A.E.S", delai: 3, estimatif: null },
  ],
  "BAES - Veilleuse": [
    { critere: "H.S", poste: "Travaux de conformité", prestation: "Remplacer la veilleuse du B.A.E.S", delai: 1, estimatif: null },
    { critere: "Hors service", poste: "Travaux de conformité", prestation: "Remplacer la veilleuse du B.A.E.S", delai: 1, estimatif: null },
  ],
  "Eclairage": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Ajouter des éclairages complémentaires dans le local technique", delai: 3, estimatif: 420.0 },
    { critere: "H.S", poste: "Travaux de conformité", prestation: "Remplacer les néons d'éclairage", delai: 1, estimatif: 50.0 },
    { critere: "Hors service", poste: "Travaux de conformité", prestation: "Remplacer les néons d'éclairage", delai: 1, estimatif: 50.0 },
  ],
  "Chemins de câbles électriques avec liaison équipotentiel": [
    { critere: "Liaison équipot", poste: "Travaux de conformité", prestation: "Ajouter une liaison équipotentielle (mise à la terre des réseaux métalliques)", delai: 1, estimatif: 350.0 },
  ],
  "Etat du local": [
    { critere: "Stock", poste: "Travaux de conformité", prestation: "Débarraser le stock de matériels présents ou le mettre en place dans un espace signalé (marquage jaune et noir)", delai: 3, estimatif: null },
    { critere: "Autres matériels", poste: "Travaux de conformité", prestation: "Débarraser les matériels ne concernant pas le local technique", delai: 1, estimatif: null },
    { critere: "Nettoy", poste: "Entretien P2", prestation: "Procéder au nettoyage du local", delai: 1, estimatif: null },
  ],
  "Calorifuge": [
    { critere: "Absen", poste: "Travaux d'amélioration", prestation: "Mettre en place un calorifuge sur les tuyauteries", delai: 6, estimatif: 8500.0 },
    { critere: "Dégrad", poste: "Travaux d'amélioration", prestation: "Remplacer le calorifuge sur les tuyauteries", delai: 6, estimatif: 8500.0 },
  ],
  "Chauffage - Type de disconnection": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place un disconnecteur BA (puissance > 70 kW) sur l'appoint d'eau", delai: 3, estimatif: 450.0 },
  ],
  "Chauffage - Compteur d'eau: Présence": [
    { critere: "Absen", poste: "Travaux d'amélioration", prestation: "Mettre en place un compteur volumétrique d'appoint d'eau", delai: 3, estimatif: 250.0 },
  ],
  "Chauffage - Compteur d'eau: Emplacement": [
    { critere: "Déplac", poste: "Travaux d'amélioration", prestation: "Déplacer le compteur volumétrique d'appoint d'eau pour ne comptabiliser que les appoints", delai: 3, estimatif: 250.0 },
  ],
  "Chauffage - Type de filtration": [
    { critere: "Absen", poste: "Travaux d'amélioration", prestation: "Mettre en place un désemboueur magnétique sur 100% du débit avec by-pass pour la maintenance", delai: 6, estimatif: 5500.0 },
  ],
  "Chauffage - Bac de rétention": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place un bac de rétention sous les produits de traitement de l'eau", delai: 3, estimatif: 250.0 },
  ],
  "Conduit de fumées - Type": [
    { critere: "Tubage", poste: "Travaux de conformité", prestation: "Prévoir un tubage du conduit de cheminée (présence d'une chaudière à condensation", delai: 1, estimatif: 8500.0 },
  ],
  "Conduit de fumées - Section": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Revoir la section du conduit de fumée (non adapté à la production)", delai: 1, estimatif: 8500.0 },
  ],
  "Conduit de fumées - Thermomètre": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre un thermomètre de fumée (chaudière > 400 kW)", delai: 1, estimatif: 150.0 },
  ],
  "Soupapes - Nb": [
    { critere: "Insuffisan", poste: "Travaux de conformité", prestation: "Prévoir la mise en place d'une deuxième soupape ou d'un système de contrôle de pression au niveau de la soupape installée sur la chaudière", delai: 1, estimatif: 450.0 },
  ],
  "Soupapes - Canalisation d'évacuation": [
    { critere: "Sol", poste: "Travaux d'amélioration", prestation: "Mettre une canalisation d'évacuation de l'eau des soupapes vers le sol", delai: 1, estimatif: 300.0 },
    { critere: "Ecoulement", poste: "Travaux d'amélioration", prestation: "Revoir l'évacuation de l'eau des soupapes pour pouvoir distinguer quelle soupape est ouverte", delai: 1, estimatif: 300.0 },
  ],
  "Soupapes - Pression de tarage": [
    { critere: null, poste: "Travaux d'amélioration", prestation: "Remplacer les soupapes de sécurité (chaudières) par des soupapes adaptées à la pression nominale du réseau et des chaudières", delai: 1, estimatif: 650.0 },
  ],
  "ECS - Type de disconnection": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place un disconnecteur EA sur l'alimentation d'eau froide destinée à l'ECS", delai: 3, estimatif: 650.0 },
  ],
  "ECS - Compteur d'eau: Présence": [
    { critere: "Absen", poste: "Travaux d'amélioration", prestation: "Mettre en place un compteur volumétrique d'ECS", delai: 3, estimatif: 350.0 },
  ],
  "ECS - Compteur d'eau: Emplacement": [
    { critere: "Déplac", poste: "Travaux d'amélioration", prestation: "Déplacer le compteur volumétrique d'ECS pour ne comptabiliser que le volume de consommation d'ECS", delai: 3, estimatif: 350.0 },
  ],
  "ECS - Etat": [
    { critere: "H.S", poste: "Garantie totale P3", prestation: "Remplacer le système de traitement de l'ECS", delai: 1, estimatif: 3500.0 },
    { critere: "Hors service", poste: "Garantie totale P3", prestation: "Remplacer le système de traitement de l'ECS", delai: 1, estimatif: 3500.0 },
  ],
  "ECS - Bac de rétention": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place un bac de rétention sous les produits de traitement de l'eau", delai: 3, estimatif: 250.0 },
  ],
  "ECS - Niveau de produit": [
    { critere: "Insuffisan", poste: "Entretien P2", prestation: "Faire l'appoint de produit de traitement", delai: 1, estimatif: null },
  ],
  "ECS - Emplacement du point d'injection": [
    { critere: null, poste: "Travaux d'amélioration", prestation: "Revoir le point d'injection du traitement d'ECS", delai: 3, estimatif: 250.0 },
  ],
  "Manchettes témoin: Départ ECS": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place une manchette témoin sur le départ ECS (tuyauterie en acier galvanisé)", delai: 3, estimatif: 350.0 },
  ],
  "Manchettes témoin: Bouclage ECS": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place une manchette témoin sur le bouclage ECS (tuyauterie en acier galvanisé)", delai: 3, estimatif: 350.0 },
  ],
  "Manchettes témoin: Eau froide": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place une manchette témoin sur l'eau froide (tuyauterie en acier galvanisé)", delai: 3, estimatif: 350.0 },
  ],
  "Trou d'homme sur ballon ECS": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Prévoir un trou d'homme sur le ballon ECS ou remplacer le ballon (volume de stockage > 1 000 L)", delai: 6, estimatif: 5500.0 },
  ],
  "Vanne de vidange sur ballon": [
    { critere: "Absen", poste: "Travaux d'amélioration", prestation: "Mettre en place une vanne de vidange pour réaliser des chasses régulières en point bas du ballon ECS", delai: 3, estimatif: 350.0 },
  ],
  "Carnet sanitaire": [
    { critere: "Absen", poste: "Entretien P2", prestation: "Mettre en place un carnet sanitaire pour le suivi de l'entretien des installations ECS", delai: 1, estimatif: null },
  ],
  "Robinet de prélèvement (départ, bouclage et EF)": [
    { critere: "Absen", poste: "Travaux de conformité", prestation: "Mettre en place des robinets de prélèvements normalisés sur l'ECS", delai: 3, estimatif: 450.0 },
  ],
  "Soupape": [
    { critere: "Absen", poste: "Travaux d'amélioration", prestation: "Mettre en place une soupape de sécurité sur l'ECS", delai: 3, estimatif: 250.0 },
  ],
  "Adoucisseur - Etat": [
    { critere: "H.S", poste: "Garantie totale P3", prestation: "Remplacer l'adoucisseur", delai: 1, estimatif: 7500.0 },
    { critere: "Hors service", poste: "Garantie totale P3", prestation: "Remplacer l'adoucisseur", delai: 1, estimatif: 7500.0 },
  ],
  "Adoucisseur - Niveau de sel": [
    { critere: "Insuffisan", poste: "Entretien P2", prestation: "Faire l'appoint de sel", delai: 1, estimatif: null },
  ],
  "Adoucisseur - Filtre / Bypass": [
    { critere: "Filtre", poste: "Travaux d'amélioration", prestation: "Mettre en place un filtre sur l'eau froide en amont de l'adoucisseur", delai: 3, estimatif: 550.0 },
    { critere: "Bypass", poste: "Travaux d'amélioration", prestation: "Mettre en place un by-pass de l'adoucisseur (pour les opérations de maintenance)", delai: 3, estimatif: 550.0 },
  ],
};


export { TRAME_DATA, RESEAU_TEMPLATE, PRESCRIPTIONS };
