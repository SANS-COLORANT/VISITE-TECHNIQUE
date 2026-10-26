/** Trame REMAR · CROUS : libellés et lignes du modèle fourni. */
export const TRAME_REMAR_CROUS = {
  "p-infos": {
    "Général": [{ "cle": "Nom du local", "type": "champ" }],
    "Informations du site": [
      {
        "cle": "Date de visite",
        "type": "champ"
      },
      {
        "cle": "Nom du site",
        "type": "champ"
      },
      {
        "cle": "Adresse",
        "type": "champ"
      },
      {
        "cle": "Nb bâtiment, nb logement & surface",
        "type": "champ"
      },
      {
        "cle": "Production chauffage",
        "type": "champ"
      },
      {
        "cle": "Type de régulation",
        "type": "champ"
      },
      {
        "cle": "Production ECS",
        "type": "champ"
      },
      {
        "cle": "Situation",
        "type": "champ"
      },
      {
        "cle": "Accessibilité",
        "type": "champ"
      }
    ]
  },
  "p-remar-reseaux": {
    "Réseaux chauffage": [
      {
        "cle": "Réseau 1",
        "type": "champ"
      },
      {
        "cle": "Réseau 2",
        "type": "champ"
      },
      {
        "cle": "Réseau 3",
        "type": "champ"
      },
      {
        "cle": "Réseau 4",
        "type": "champ"
      },
      {
        "cle": "Réseau 5",
        "type": "champ"
      }
    ]
  },
  "p-conf-local": {
    "Conformité Local": [
      {
        "cle": "Coupure extérieure Gaz",
        "type": "controle"
      },
      {
        "cle": "Coupure extérieure électrique",
        "type": "controle"
      },
      {
        "cle": "Porte d'accès",
        "type": "controle"
      },
      {
        "cle": "BAES",
        "type": "controle"
      },
      {
        "cle": "Ventilation",
        "type": "controle"
      },
      {
        "cle": "Extincteurs",
        "type": "controle"
      },
      {
        "cle": "Gaine pompiers",
        "type": "controle"
      },
      {
        "cle": "Consignes de sécurité",
        "type": "controle"
      },
      {
        "cle": "Schéma hydraulique à jour",
        "type": "controle"
      },
      {
        "cle": "Armoire électrique",
        "type": "controle"
      },
      {
        "cle": "Ligne de Gaz",
        "type": "controle"
      },
      {
        "cle": "Evacuation des EU",
        "type": "controle"
      },
      {
        "cle": "Eclairage",
        "type": "controle"
      },
      {
        "cle": "Chemins de câbles électriques avec liaison équipotentiel",
        "type": "controle"
      },
      {
        "cle": "Etat du local",
        "type": "controle"
      },
      {
        "cle": "Point de puisage",
        "type": "controle"
      },
      {
        "cle": "Calorifuge",
        "type": "controle"
      }
    ]
  },
  "p-conf-chauffage": {
    "Conformité Chauffage": [
      {
        "cle": "Traitement d'eau",
        "type": "controle"
      },
      {
        "cle": "Vase d'expansion",
        "type": "controle"
      },
      {
        "cle": "Soupape",
        "type": "controle"
      },
      {
        "cle": "Désemboueur",
        "type": "controle"
      },
      {
        "cle": "Conduits de fumées",
        "type": "controle"
      },
      {
        "cle": "Disconnecteur",
        "type": "controle"
      },
      {
        "cle": "Adoucisseur",
        "type": "controle"
      }
    ]
  },
  "p-conf-ecs": {
    "Conformité ECS": [
      {
        "cle": "Filtres",
        "type": "controle"
      },
      {
        "cle": "Produit de traitement",
        "type": "controle"
      },
      {
        "cle": "Manchettes témoins",
        "type": "controle"
      },
      {
        "cle": "Vanne de vidange sur ballon",
        "type": "controle"
      },
      {
        "cle": "Robinet de prélèvement (départ, bouclage)",
        "type": "controle"
      },
      {
        "cle": "Soupape",
        "type": "controle"
      },
      {
        "cle": "Adoucisseur",
        "type": "controle"
      }
    ]
  },
  "p-distrib": {
    "Distribution Chauffage": [
      {
        "cle": "Matériaux tuyauterie",
        "type": "champ"
      },
      {
        "cle": "Type de distribution",
        "type": "champ"
      },
      {
        "cle": "Type d'émetteur",
        "type": "champ"
      },
      {
        "cle": "Type de robinetterie",
        "type": "champ"
      },
      {
        "cle": "Calorifuge (type / état)",
        "type": "champ"
      },
      {
        "cle": "Variation de vitesse",
        "type": "champ"
      }
    ],
    "Distribution ECS": [
      {
        "cle": "Matériaux tuyauterie",
        "type": "champ"
      },
      {
        "cle": "Type de distribution",
        "type": "champ"
      },
      {
        "cle": "Calorifuge (type / état)",
        "type": "champ"
      },
      {
        "cle": "Variation de vitesse",
        "type": "champ"
      }
    ]
  },
  "p-remar-releves": {
    "Compteur": [
      {
        "cle": "Compteur Gaz (m³)",
        "type": "champ",
        "keyboardType": "decimal-pad"
      },
      {
        "cle": "Compteur d'énergie (MWh)",
        "type": "champ",
        "keyboardType": "decimal-pad"
      },
      {
        "cle": "Compteur ECS (m³)",
        "type": "champ",
        "keyboardType": "decimal-pad"
      },
      {
        "cle": "Compteur appoint (m³)",
        "type": "champ",
        "keyboardType": "decimal-pad"
      }
    ],
    "Température chaufferie": [
      {
        "cle": "Chauffage aller (°C)",
        "type": "champ",
        "numeric": {
          "min": 0,
          "max": 120,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "Chauffage retour (°C)",
        "type": "champ",
        "numeric": {
          "min": 0,
          "max": 120,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "ECS départ (°C)",
        "type": "champ",
        "numeric": {
          "min": 0,
          "max": 120,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "ECS bouclage (°C)",
        "type": "champ",
        "numeric": {
          "min": 0,
          "max": 120,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "ECS stockage (°C)",
        "type": "champ",
        "numeric": {
          "min": 0,
          "max": 120,
          "step": 0.1,
          "unit": "°C"
        }
      }
    ]
  },
  "p-remar-energie": {
    "Chaufferie": [
      {
        "cle": "GTB",
        "type": "controle"
      },
      {
        "cle": "Chaudière",
        "type": "controle"
      },
      {
        "cle": "Brûleur",
        "type": "controle"
      },
      {
        "cle": "Condensation",
        "type": "controle"
      },
      {
        "cle": "Consignes / programmes",
        "type": "controle"
      },
      {
        "cle": "Vannes 3 voies",
        "type": "controle"
      }
    ]
  },
  "p-remar-cta": {
    "Informations techniques": [
      {
        "cle": "Désignation CTA",
        "type": "champ"
      },
      {
        "cle": "Année CTA",
        "type": "champ"
      },
      {
        "cle": "Type traitement d'air",
        "type": "champ"
      },
      {
        "cle": "Type de batterie",
        "type": "champ"
      },
      {
        "cle": "Contrôle d'humidité",
        "type": "champ"
      },
      {
        "cle": "Récupération d'énergie",
        "type": "champ"
      },
      {
        "cle": "Raccordement GTC",
        "type": "champ"
      },
      {
        "cle": "Exploitant - marché",
        "type": "champ"
      }
    ],
    "Avis sur l’entretien général": [
      {
        "cle": "Eclairage du caisson",
        "type": "controle"
      },
      {
        "cle": "Date du dernier remplacement de filtre",
        "type": "controle"
      },
      {
        "cle": "Date de la dernière qualification",
        "type": "controle"
      },
      {
        "cle": "Nettoyage des gaines horizontal & vertical",
        "type": "controle"
      },
      {
        "cle": "Calorifugeage",
        "type": "controle"
      }
    ]
  },
  "p-remar-filtres": {
    "Filtre n°1": [
      {
        "cle": "Type de filtre",
        "type": "champ"
      },
      {
        "cle": "Etat du filtre",
        "type": "controle"
      }
    ],
    "Filtre n°2": [
      {
        "cle": "Type de filtre",
        "type": "champ"
      },
      {
        "cle": "Etat du filtre",
        "type": "controle"
      }
    ],
    "Filtre n°3": [
      {
        "cle": "Type de filtre",
        "type": "champ"
      },
      {
        "cle": "Etat du filtre",
        "type": "controle"
      }
    ]
  },
  "p-remar-cta-mesures": {
    "Températures": [
      {
        "cle": "Air neuf",
        "type": "champ",
        "numeric": {
          "min": -30,
          "max": 100,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "Après récupération",
        "type": "champ",
        "numeric": {
          "min": -30,
          "max": 100,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "Soufflage",
        "type": "champ",
        "numeric": {
          "min": -30,
          "max": 100,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "Extraction / Reprise",
        "type": "champ",
        "numeric": {
          "min": -30,
          "max": 100,
          "step": 0.1,
          "unit": "°C"
        }
      }
    ],
    "Variation de vitesse": [
      {
        "cle": "Soufflage",
        "type": "champ"
      },
      {
        "cle": "Extraction / Reprise",
        "type": "champ"
      }
    ],
    "Consignes": [
      {
        "cle": "Soufflage",
        "type": "champ",
        "numeric": {
          "min": -30,
          "max": 100,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "Extraction / Reprise",
        "type": "champ",
        "numeric": {
          "min": -30,
          "max": 100,
          "step": 0.1,
          "unit": "°C"
        }
      },
      {
        "cle": "Pression",
        "type": "champ",
        "numeric": {
          "min": 0,
          "max": 3000,
          "step": 1,
          "unit": "Pa"
        }
      }
    ]
  },
  "p-remar-cta-energie": {
    "CTA": [
      {
        "cle": "GTB",
        "type": "controle"
      },
      {
        "cle": "Variateur",
        "type": "controle"
      },
      {
        "cle": "Efficacité du récupérateur",
        "type": "controle"
      },
      {
        "cle": "Efficacité des moteurs",
        "type": "controle"
      },
      {
        "cle": "Consignes / programmes",
        "type": "controle"
      },
      {
        "cle": "Vannes de régulation",
        "type": "controle"
      }
    ]
  },
  "p-remar-vmc": {
    "Informations générales": [
      {
        "cle": "Type de ventilation",
        "type": "champ"
      },
      {
        "cle": "Nombre de caissons",
        "type": "champ"
      },
      {
        "cle": "Type de bouche",
        "type": "champ"
      }
    ],
    "Situation": [
      {
        "cle": "Situation du caisson",
        "type": "controle"
      },
      {
        "cle": "Accès au caisson",
        "type": "controle"
      },
      {
        "cle": "Garde-corps / ligne de vie",
        "type": "controle"
      }
    ],
    "Caisson": [
      {
        "cle": "Etat du caisson",
        "type": "controle"
      },
      {
        "cle": "Fonctionnement",
        "type": "controle"
      },
      {
        "cle": "Nettoyage caisson",
        "type": "controle"
      },
      {
        "cle": "Etat courroie",
        "type": "controle"
      },
      {
        "cle": "Coupure électrique",
        "type": "controle"
      }
    ],
    "Distribution": [
      {
        "cle": "Etat manchette",
        "type": "controle"
      },
      {
        "cle": "Etat extérieur traînasse",
        "type": "controle"
      },
      {
        "cle": "Etanchéité traînasse",
        "type": "controle"
      },
      {
        "cle": "Nettoyage traînasse",
        "type": "controle"
      },
      {
        "cle": "Pied de soutien",
        "type": "controle"
      },
      {
        "cle": "Registre",
        "type": "controle"
      },
      {
        "cle": "Trappe de visite",
        "type": "controle"
      },
      {
        "cle": "Chapeau",
        "type": "controle"
      },
      {
        "cle": "Nettoyage colonne",
        "type": "controle"
      }
    ],
    "Gestion": [
      {
        "cle": "Télégestion",
        "type": "controle"
      },
      {
        "cle": "Pressostat",
        "type": "controle"
      }
    ]
  },
  "p-remar-froid": {
    "Informations du site": [
      {
        "cle": "Production froid",
        "type": "champ"
      },
      {
        "cle": "Type de régulation",
        "type": "champ"
      },
      {
        "cle": "Situation",
        "type": "champ"
      },
      {
        "cle": "Accessibilité",
        "type": "champ"
      },
      {
        "cle": "Support anti-vibratile",
        "type": "champ"
      },
      {
        "cle": "Traitement acoustique",
        "type": "champ"
      }
    ],
    "Réseaux": [
      {
        "cle": "Volume tampon",
        "type": "champ"
      },
      {
        "cle": "Réseau 1",
        "type": "champ"
      },
      {
        "cle": "Réseau 2",
        "type": "champ"
      },
      {
        "cle": "Réseau 3",
        "type": "champ"
      }
    ]
  }
};

export const REMAR_SECTION_RANGES = {
  "p-infos": {
    "Général": [1, 5],
    "Informations du site": [
      12,
      20
    ]
  },
  "p-remar-reseaux": {
    "Réseaux chauffage": [
      25,
      29
    ]
  },
  "p-conf-local": {
    "Conformité Local": [
      36,
      52
    ]
  },
  "p-conf-chauffage": {
    "Conformité Chauffage": [
      57,
      63
    ]
  },
  "p-conf-ecs": {
    "Conformité ECS": [
      68,
      74
    ]
  },
  "p-distrib": {
    "Distribution Chauffage": [
      81,
      86
    ],
    "Distribution ECS": [
      91,
      94
    ]
  },
  "p-remar-releves": {
    "Compteur": [
      101,
      104
    ],
    "Température chaufferie": [
      109,
      113
    ]
  },
  "p-remar-energie": {
    "Chaufferie": [
      120,
      125
    ]
  },
  "p-remar-cta": {
    "Informations techniques": [
      132,
      139
    ],
    "Avis sur l’entretien général": [
      144,
      148
    ]
  },
  "p-remar-filtres": {
    "Filtre n°1": [
      155,
      156
    ],
    "Filtre n°2": [
      161,
      162
    ],
    "Filtre n°3": [
      167,
      168
    ]
  },
  "p-remar-cta-mesures": {
    "Températures": [
      175,
      178
    ],
    "Variation de vitesse": [
      183,
      184
    ],
    "Consignes": [
      189,
      191
    ]
  },
  "p-remar-cta-energie": {
    "CTA": [
      198,
      203
    ]
  },
  "p-remar-vmc": {
    "Informations générales": [
      210,
      212
    ],
    "Situation": [
      219,
      221
    ],
    "Caisson": [
      226,
      230
    ],
    "Distribution": [
      235,
      243
    ],
    "Gestion": [
      248,
      249
    ]
  },
  "p-remar-froid": {
    "Informations du site": [
      256,
      261
    ],
    "Réseaux": [
      266,
      269
    ]
  }
};
