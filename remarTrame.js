import { TEMPLATE_REMAR_BASE64 } from './templateExcelRemar.js';

/** Définition déclarative REMAR ; le rendu et les sauvegardes sont ceux des autres trames. */
const definition = {
  "id": "remar_v1",
  "version": 1,
  "nom": "TRAME REMAR",
  "description": "Chaufferie, CTA, VMC et production de froid",
  "actif": true,
  "libraryManaged": true,
  "ui": {
    "panels": {
      "p-infos": {
        "Général": [
          {
            "cle": "Nom du client",
            "type": "champ",
            "meta": "client"
          },
          {
            "cle": "Nom du site",
            "type": "champ",
            "meta": "site"
          },
          {
            "cle": "Nom du local",
            "type": "champ",
            "meta": "local"
          },
          {
            "cle": "Trame utilisée",
            "type": "champ",
            "meta": "type"
          },
          {
            "cle": "Date de la visite",
            "type": "champ",
            "meta": "dateVisite"
          }
        ],
        "Informations générales": [
          {
            "cle": "Date de visite",
            "type": "champ",
            "meta": "dateVisite"
          },
          {
            "cle": "Nom du site",
            "type": "champ",
            "meta": "site"
          },
          {
            "cle": "Adresse",
            "type": "champ",
            "meta": "adresse"
          },
          {
            "cle": "Nb bâtiment, nb logement & surface",
            "type": "champ",
            "textOnly": true
          },
          {
            "cle": "Production chauffage",
            "type": "champ",
            "options": [
              "Chaudière gaz",
              "Chaudière fioul",
              "PAC",
              "Réseau de chaleur",
              "Électrique"
            ],
            "semanticKey": "production.primaire.type"
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
            "type": "champ",
            "options": [
              "Sous-sol",
              "Rez-de-chaussée",
              "Étage",
              "Toiture",
              "Extérieur"
            ]
          },
          {
            "cle": "Accessibilité",
            "type": "champ",
            "options": [
              "Libre",
              "Clé nécessaire",
              "Accès sécurisé",
              "Accès difficile"
            ]
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
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Coupure extérieure Gaz : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Coupure extérieure Gaz : anomalie constatée, intervention à préciser.",
                  "reserve": "Coupure extérieure Gaz : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Coupure extérieure Gaz : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Coupure extérieure Gaz : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Coupure extérieure Gaz : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Coupure extérieure électrique",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Coupure extérieure électrique : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Coupure extérieure électrique : anomalie constatée, intervention à préciser.",
                  "reserve": "Coupure extérieure électrique : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Coupure extérieure électrique : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Coupure extérieure électrique : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Coupure extérieure électrique : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Porte d'accès",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Porte d'accès : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Porte d'accès : anomalie constatée, intervention à préciser.",
                  "reserve": "Porte d'accès : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Porte d'accès : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Porte d'accès : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Porte d'accès : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "BAES",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "BAES : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "BAES : anomalie constatée, intervention à préciser.",
                  "reserve": "BAES : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "BAES : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "BAES : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "BAES : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Ventilation",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Ventilation : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Ventilation : anomalie constatée, intervention à préciser.",
                  "reserve": "Ventilation : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Ventilation : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Ventilation : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Ventilation : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Extincteurs",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Extincteurs : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Extincteurs : anomalie constatée, intervention à préciser.",
                  "reserve": "Extincteurs : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Extincteurs : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Extincteurs : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Extincteurs : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Gaine pompiers",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Gaine pompiers : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Gaine pompiers : anomalie constatée, intervention à préciser.",
                  "reserve": "Gaine pompiers : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Gaine pompiers : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Gaine pompiers : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Gaine pompiers : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Consignes de sécurité",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Consignes de sécurité : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Consignes de sécurité : anomalie constatée, intervention à préciser.",
                  "reserve": "Consignes de sécurité : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Consignes de sécurité : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Consignes de sécurité : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Consignes de sécurité : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Schéma hydraulique à jour",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Schéma hydraulique à jour : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Schéma hydraulique à jour : anomalie constatée, intervention à préciser.",
                  "reserve": "Schéma hydraulique à jour : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Schéma hydraulique à jour : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Schéma hydraulique à jour : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Schéma hydraulique à jour : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Armoire électrique",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Armoire électrique : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Armoire électrique : anomalie constatée, intervention à préciser.",
                  "reserve": "Armoire électrique : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Armoire électrique : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Armoire électrique : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Armoire électrique : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Ligne de Gaz",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Ligne de Gaz : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Ligne de Gaz : anomalie constatée, intervention à préciser.",
                  "reserve": "Ligne de Gaz : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Ligne de Gaz : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Ligne de Gaz : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Ligne de Gaz : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Evacuation des EU",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Evacuation des EU : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Evacuation des EU : anomalie constatée, intervention à préciser.",
                  "reserve": "Evacuation des EU : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Evacuation des EU : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Evacuation des EU : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Evacuation des EU : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Eclairage",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Eclairage : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Eclairage : anomalie constatée, intervention à préciser.",
                  "reserve": "Eclairage : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Eclairage : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Eclairage : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Eclairage : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Chemins de câbles électriques avec liaison équipotentiel",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Chemins de câbles électriques avec liaison équipotentiel : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Chemins de câbles électriques avec liaison équipotentiel : anomalie constatée, intervention à préciser.",
                  "reserve": "Chemins de câbles électriques avec liaison équipotentiel : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Chemins de câbles électriques avec liaison équipotentiel : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Chemins de câbles électriques avec liaison équipotentiel : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Chemins de câbles électriques avec liaison équipotentiel : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Etat du local",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etat du local : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etat du local : anomalie constatée, intervention à préciser.",
                  "reserve": "Etat du local : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etat du local : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etat du local : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etat du local : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Point de puisage",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Point de puisage : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Point de puisage : anomalie constatée, intervention à préciser.",
                  "reserve": "Point de puisage : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Point de puisage : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Point de puisage : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Point de puisage : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Calorifuge",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Local",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Calorifuge : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Calorifuge : anomalie constatée, intervention à préciser.",
                  "reserve": "Calorifuge : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Calorifuge : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Calorifuge : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Calorifuge : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ]
      },
      "p-conf-chauffage": {
        "Conformité Chauffage": [
          {
            "cle": "Traitement d'eau",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Chauffage",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Traitement d'eau : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Traitement d'eau : anomalie constatée, intervention à préciser.",
                  "reserve": "Traitement d'eau : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Traitement d'eau : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Traitement d'eau : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Traitement d'eau : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Vase d'expansion",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Chauffage",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Vase d'expansion : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Vase d'expansion : anomalie constatée, intervention à préciser.",
                  "reserve": "Vase d'expansion : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Vase d'expansion : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Vase d'expansion : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Vase d'expansion : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Soupape",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Chauffage",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Soupape : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Soupape : anomalie constatée, intervention à préciser.",
                  "reserve": "Soupape : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Soupape : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Soupape : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Soupape : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Désemboueur",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Chauffage",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Désemboueur : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Désemboueur : anomalie constatée, intervention à préciser.",
                  "reserve": "Désemboueur : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Désemboueur : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Désemboueur : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Désemboueur : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Conduits de fumées",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Chauffage",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Conduits de fumées : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Conduits de fumées : anomalie constatée, intervention à préciser.",
                  "reserve": "Conduits de fumées : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Conduits de fumées : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Conduits de fumées : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Conduits de fumées : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Disconnecteur",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Chauffage",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Disconnecteur : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Disconnecteur : anomalie constatée, intervention à préciser.",
                  "reserve": "Disconnecteur : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Disconnecteur : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Disconnecteur : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Disconnecteur : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Adoucisseur",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité Chauffage",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Adoucisseur : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Adoucisseur : anomalie constatée, intervention à préciser.",
                  "reserve": "Adoucisseur : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Adoucisseur : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Adoucisseur : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Adoucisseur : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ]
      },
      "p-conf-ecs": {
        "Conformité ECS": [
          {
            "cle": "Filtres",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité ECS",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Filtres : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Filtres : anomalie constatée, intervention à préciser.",
                  "reserve": "Filtres : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Filtres : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Filtres : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Filtres : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Produit de traitement",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité ECS",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Produit de traitement : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Produit de traitement : anomalie constatée, intervention à préciser.",
                  "reserve": "Produit de traitement : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Produit de traitement : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Produit de traitement : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Produit de traitement : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Manchettes témoins",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité ECS",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Manchettes témoins : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Manchettes témoins : anomalie constatée, intervention à préciser.",
                  "reserve": "Manchettes témoins : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Manchettes témoins : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Manchettes témoins : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Manchettes témoins : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Vanne de vidange sur ballon",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité ECS",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Vanne de vidange sur ballon : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Vanne de vidange sur ballon : anomalie constatée, intervention à préciser.",
                  "reserve": "Vanne de vidange sur ballon : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Vanne de vidange sur ballon : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Vanne de vidange sur ballon : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Vanne de vidange sur ballon : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Robinet de prélèvement (départ, bouclage)",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité ECS",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Robinet de prélèvement (départ, bouclage) : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Robinet de prélèvement (départ, bouclage) : anomalie constatée, intervention à préciser.",
                  "reserve": "Robinet de prélèvement (départ, bouclage) : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Robinet de prélèvement (départ, bouclage) : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Robinet de prélèvement (départ, bouclage) : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Robinet de prélèvement (départ, bouclage) : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Soupape",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité ECS",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Soupape : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Soupape : anomalie constatée, intervention à préciser.",
                  "reserve": "Soupape : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Soupape : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Soupape : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Soupape : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Adoucisseur",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Conformité ECS",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Adoucisseur : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Adoucisseur : anomalie constatée, intervention à préciser.",
                  "reserve": "Adoucisseur : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Adoucisseur : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Adoucisseur : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Adoucisseur : non visible ou inaccessible lors de la visite."
                }
              ]
            }
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
            "keyboardType": "decimal-pad",
            "numericIndex": true
          },
          {
            "cle": "Compteur d'énergie (MWh)",
            "type": "champ",
            "keyboardType": "decimal-pad",
            "numericIndex": true
          },
          {
            "cle": "Compteur ECS (m³)",
            "type": "champ",
            "keyboardType": "decimal-pad",
            "numericIndex": true
          },
          {
            "cle": "Compteur appoint (m³)",
            "type": "champ",
            "keyboardType": "decimal-pad",
            "numericIndex": true
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
              "unit": "°C",
              "start": 20
            },
            "semanticKey": "mesure.chauffage.depart"
          },
          {
            "cle": "Chauffage retour (°C)",
            "type": "champ",
            "numeric": {
              "min": 0,
              "max": 120,
              "step": 0.1,
              "unit": "°C",
              "start": 20
            },
            "semanticKey": "mesure.chauffage.retour"
          },
          {
            "cle": "ECS départ (°C)",
            "type": "champ",
            "numeric": {
              "min": 0,
              "max": 120,
              "step": 0.1,
              "unit": "°C",
              "start": 20
            },
            "semanticKey": "mesure.ecs.depart"
          },
          {
            "cle": "ECS bouclage (°C)",
            "type": "champ",
            "numeric": {
              "min": 0,
              "max": 120,
              "step": 0.1,
              "unit": "°C",
              "start": 20
            },
            "semanticKey": "mesure.ecs.retour"
          },
          {
            "cle": "ECS stockage (°C)",
            "type": "champ",
            "numeric": {
              "min": 0,
              "max": 120,
              "step": 0.1,
              "unit": "°C",
              "start": 20
            },
            "semanticKey": "mesure.ecs.stockage"
          }
        ]
      },
      "p-remar-energie": {
        "Chaufferie": [
          {
            "cle": "GTB",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Chaufferie",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "GTB : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "GTB : anomalie constatée, intervention à préciser.",
                  "reserve": "GTB : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "GTB : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "GTB : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "GTB : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Chaudière",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Chaufferie",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Chaudière : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Chaudière : anomalie constatée, intervention à préciser.",
                  "reserve": "Chaudière : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Chaudière : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Chaudière : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Chaudière : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Brûleur",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Chaufferie",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Brûleur : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Brûleur : anomalie constatée, intervention à préciser.",
                  "reserve": "Brûleur : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Brûleur : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Brûleur : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Brûleur : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Condensation",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Chaufferie",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Condensation : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Condensation : anomalie constatée, intervention à préciser.",
                  "reserve": "Condensation : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Condensation : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Condensation : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Condensation : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Consignes / programmes",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Chaufferie",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Consignes / programmes : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Consignes / programmes : anomalie constatée, intervention à préciser.",
                  "reserve": "Consignes / programmes : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Consignes / programmes : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Consignes / programmes : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Consignes / programmes : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Vannes 3 voies",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Chaufferie",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Vannes 3 voies : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Vannes 3 voies : anomalie constatée, intervention à préciser.",
                  "reserve": "Vannes 3 voies : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Vannes 3 voies : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Vannes 3 voies : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Vannes 3 voies : non visible ou inaccessible lors de la visite."
                }
              ]
            }
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
            "type": "champ",
            "numeric": {
              "min": 1900,
              "max": 2100,
              "step": 1,
              "unit": "",
              "start": 2020
            }
          },
          {
            "cle": "Type traitement d'air",
            "type": "champ",
            "options": [
              "Simple flux",
              "Double flux",
              "Tout air neuf",
              "Recyclage"
            ]
          },
          {
            "cle": "Type de batterie",
            "type": "champ",
            "options": [
              "Eau chaude",
              "Eau glacée",
              "Électrique",
              "Détente directe"
            ]
          },
          {
            "cle": "Contrôle d'humidité",
            "type": "champ",
            "options": [
              "Aucun",
              "Humidification",
              "Déshumidification"
            ]
          },
          {
            "cle": "Récupération d'énergie",
            "type": "champ",
            "options": [
              "Échangeur à plaques",
              "Roue thermique",
              "Batteries à eau glycolée",
              "Aucune"
            ]
          },
          {
            "cle": "Raccordement GTC",
            "type": "champ",
            "options": [
              "Oui",
              "Non",
              "À vérifier"
            ]
          },
          {
            "cle": "Exploitant - marché",
            "type": "champ"
          }
        ],
        "Avis sur l’entretien général": [
          {
            "cle": "Eclairage du caisson",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Avis sur l’entretien général",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Eclairage du caisson : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Eclairage du caisson : anomalie constatée, intervention à préciser.",
                  "reserve": "Eclairage du caisson : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Eclairage du caisson : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Eclairage du caisson : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Eclairage du caisson : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Date du dernier remplacement de filtre",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Avis sur l’entretien général",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Date du dernier remplacement de filtre : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Date du dernier remplacement de filtre : anomalie constatée, intervention à préciser.",
                  "reserve": "Date du dernier remplacement de filtre : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Date du dernier remplacement de filtre : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Date du dernier remplacement de filtre : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Date du dernier remplacement de filtre : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Date de la dernière qualification",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Avis sur l’entretien général",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Date de la dernière qualification : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Date de la dernière qualification : anomalie constatée, intervention à préciser.",
                  "reserve": "Date de la dernière qualification : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Date de la dernière qualification : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Date de la dernière qualification : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Date de la dernière qualification : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Nettoyage des gaines horizontal & vertical",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Avis sur l’entretien général",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Nettoyage des gaines horizontal & vertical : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Nettoyage des gaines horizontal & vertical : anomalie constatée, intervention à préciser.",
                  "reserve": "Nettoyage des gaines horizontal & vertical : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Nettoyage des gaines horizontal & vertical : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Nettoyage des gaines horizontal & vertical : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Nettoyage des gaines horizontal & vertical : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Calorifugeage",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Avis sur l’entretien général",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Calorifugeage : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Calorifugeage : anomalie constatée, intervention à préciser.",
                  "reserve": "Calorifugeage : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Calorifugeage : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Calorifugeage : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Calorifugeage : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ]
      },
      "p-remar-filtres": {
        "Filtre n°1": [
          {
            "cle": "Type de filtre",
            "type": "champ",
            "options": [
              "G4",
              "M5",
              "F7",
              "F9",
              "HEPA",
              "ePM1",
              "ePM2,5",
              "ePM10"
            ]
          },
          {
            "cle": "Etat du filtre",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Filtre n°1",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etat du filtre : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etat du filtre : anomalie constatée, intervention à préciser.",
                  "reserve": "Etat du filtre : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etat du filtre : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etat du filtre : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etat du filtre : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ],
        "Filtre n°2": [
          {
            "cle": "Type de filtre",
            "type": "champ",
            "options": [
              "G4",
              "M5",
              "F7",
              "F9",
              "HEPA",
              "ePM1",
              "ePM2,5",
              "ePM10"
            ]
          },
          {
            "cle": "Etat du filtre",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Filtre n°2",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etat du filtre : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etat du filtre : anomalie constatée, intervention à préciser.",
                  "reserve": "Etat du filtre : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etat du filtre : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etat du filtre : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etat du filtre : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ],
        "Filtre n°3": [
          {
            "cle": "Type de filtre",
            "type": "champ",
            "options": [
              "G4",
              "M5",
              "F7",
              "F9",
              "HEPA",
              "ePM1",
              "ePM2,5",
              "ePM10"
            ]
          },
          {
            "cle": "Etat du filtre",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Filtre n°3",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etat du filtre : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etat du filtre : anomalie constatée, intervention à préciser.",
                  "reserve": "Etat du filtre : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etat du filtre : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etat du filtre : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etat du filtre : non visible ou inaccessible lors de la visite."
                }
              ]
            }
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
              "unit": "°C",
              "start": 20
            }
          },
          {
            "cle": "Après récupération",
            "type": "champ",
            "numeric": {
              "min": -30,
              "max": 100,
              "step": 0.1,
              "unit": "°C",
              "start": 20
            }
          },
          {
            "cle": "Soufflage",
            "type": "champ",
            "numeric": {
              "min": -30,
              "max": 100,
              "step": 0.1,
              "unit": "°C",
              "start": 20
            }
          },
          {
            "cle": "Extraction / Reprise",
            "type": "champ",
            "numeric": {
              "min": -30,
              "max": 100,
              "step": 0.1,
              "unit": "°C",
              "start": 20
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
              "unit": "°C",
              "start": 20
            }
          },
          {
            "cle": "Extraction / Reprise",
            "type": "champ",
            "numeric": {
              "min": -30,
              "max": 100,
              "step": 0.1,
              "unit": "°C",
              "start": 20
            }
          },
          {
            "cle": "Pression",
            "type": "champ",
            "numeric": {
              "min": 0,
              "max": 3000,
              "step": 1,
              "unit": "Pa",
              "start": 100
            }
          }
        ]
      },
      "p-remar-cta-energie": {
        "CTA": [
          {
            "cle": "GTB",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "CTA",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "GTB : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "GTB : anomalie constatée, intervention à préciser.",
                  "reserve": "GTB : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "GTB : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "GTB : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "GTB : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Variateur",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "CTA",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Variateur : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Variateur : anomalie constatée, intervention à préciser.",
                  "reserve": "Variateur : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Variateur : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Variateur : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Variateur : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Efficacité du récupérateur",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "CTA",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Efficacité du récupérateur : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Efficacité du récupérateur : anomalie constatée, intervention à préciser.",
                  "reserve": "Efficacité du récupérateur : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Efficacité du récupérateur : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Efficacité du récupérateur : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Efficacité du récupérateur : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Efficacité des moteurs",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "CTA",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Efficacité des moteurs : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Efficacité des moteurs : anomalie constatée, intervention à préciser.",
                  "reserve": "Efficacité des moteurs : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Efficacité des moteurs : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Efficacité des moteurs : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Efficacité des moteurs : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Consignes / programmes",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "CTA",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Consignes / programmes : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Consignes / programmes : anomalie constatée, intervention à préciser.",
                  "reserve": "Consignes / programmes : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Consignes / programmes : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Consignes / programmes : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Consignes / programmes : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Vannes de régulation",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "CTA",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Vannes de régulation : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Vannes de régulation : anomalie constatée, intervention à préciser.",
                  "reserve": "Vannes de régulation : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Vannes de régulation : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Vannes de régulation : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Vannes de régulation : non visible ou inaccessible lors de la visite."
                }
              ]
            }
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
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Situation",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Situation du caisson : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Situation du caisson : anomalie constatée, intervention à préciser.",
                  "reserve": "Situation du caisson : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Situation du caisson : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Situation du caisson : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Situation du caisson : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Accès au caisson",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Situation",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Accès au caisson : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Accès au caisson : anomalie constatée, intervention à préciser.",
                  "reserve": "Accès au caisson : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Accès au caisson : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Accès au caisson : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Accès au caisson : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Garde-corps / ligne de vie",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Situation",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Garde-corps / ligne de vie : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Garde-corps / ligne de vie : anomalie constatée, intervention à préciser.",
                  "reserve": "Garde-corps / ligne de vie : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Garde-corps / ligne de vie : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Garde-corps / ligne de vie : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Garde-corps / ligne de vie : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ],
        "Caisson": [
          {
            "cle": "Etat du caisson",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Caisson",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etat du caisson : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etat du caisson : anomalie constatée, intervention à préciser.",
                  "reserve": "Etat du caisson : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etat du caisson : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etat du caisson : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etat du caisson : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Fonctionnement",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Caisson",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Fonctionnement : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Fonctionnement : anomalie constatée, intervention à préciser.",
                  "reserve": "Fonctionnement : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Fonctionnement : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Fonctionnement : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Fonctionnement : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Nettoyage caisson",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Caisson",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Nettoyage caisson : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Nettoyage caisson : anomalie constatée, intervention à préciser.",
                  "reserve": "Nettoyage caisson : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Nettoyage caisson : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Nettoyage caisson : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Nettoyage caisson : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Etat courroie",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Caisson",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etat courroie : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etat courroie : anomalie constatée, intervention à préciser.",
                  "reserve": "Etat courroie : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etat courroie : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etat courroie : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etat courroie : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Coupure électrique",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Caisson",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Coupure électrique : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Coupure électrique : anomalie constatée, intervention à préciser.",
                  "reserve": "Coupure électrique : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Coupure électrique : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Coupure électrique : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Coupure électrique : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ],
        "Distribution": [
          {
            "cle": "Etat manchette",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etat manchette : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etat manchette : anomalie constatée, intervention à préciser.",
                  "reserve": "Etat manchette : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etat manchette : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etat manchette : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etat manchette : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Etat extérieur traînasse",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etat extérieur traînasse : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etat extérieur traînasse : anomalie constatée, intervention à préciser.",
                  "reserve": "Etat extérieur traînasse : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etat extérieur traînasse : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etat extérieur traînasse : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etat extérieur traînasse : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Etanchéité traînasse",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Etanchéité traînasse : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Etanchéité traînasse : anomalie constatée, intervention à préciser.",
                  "reserve": "Etanchéité traînasse : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Etanchéité traînasse : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Etanchéité traînasse : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Etanchéité traînasse : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Nettoyage traînasse",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Nettoyage traînasse : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Nettoyage traînasse : anomalie constatée, intervention à préciser.",
                  "reserve": "Nettoyage traînasse : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Nettoyage traînasse : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Nettoyage traînasse : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Nettoyage traînasse : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Pied de soutien",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Pied de soutien : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Pied de soutien : anomalie constatée, intervention à préciser.",
                  "reserve": "Pied de soutien : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Pied de soutien : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Pied de soutien : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Pied de soutien : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Registre",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Registre : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Registre : anomalie constatée, intervention à préciser.",
                  "reserve": "Registre : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Registre : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Registre : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Registre : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Trappe de visite",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Trappe de visite : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Trappe de visite : anomalie constatée, intervention à préciser.",
                  "reserve": "Trappe de visite : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Trappe de visite : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Trappe de visite : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Trappe de visite : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Chapeau",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Chapeau : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Chapeau : anomalie constatée, intervention à préciser.",
                  "reserve": "Chapeau : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Chapeau : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Chapeau : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Chapeau : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Nettoyage colonne",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Distribution",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Nettoyage colonne : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Nettoyage colonne : anomalie constatée, intervention à préciser.",
                  "reserve": "Nettoyage colonne : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Nettoyage colonne : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Nettoyage colonne : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Nettoyage colonne : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ],
        "Gestion": [
          {
            "cle": "Télégestion",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Gestion",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Télégestion : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Télégestion : anomalie constatée, intervention à préciser.",
                  "reserve": "Télégestion : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Télégestion : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Télégestion : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Télégestion : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          },
          {
            "cle": "Pressostat",
            "type": "controle",
            "trameLabel": "TRAME REMAR",
            "poste": "Gestion",
            "presets": {
              "S": [
                {
                  "label": "Satisfaisant",
                  "commentaire": "Pressostat : état satisfaisant au contrôle."
                }
              ],
              "N.S": [
                {
                  "label": "Anomalie à préciser",
                  "commentaire": "Pressostat : anomalie constatée, intervention à préciser.",
                  "reserve": "Pressostat : anomalie constatée, intervention à préciser."
                }
              ],
              "N.R": [
                {
                  "label": "Non réalisé",
                  "commentaire": "Pressostat : contrôle non réalisé, motif à préciser."
                }
              ],
              "S.O": [
                {
                  "label": "Sans objet",
                  "commentaire": "Pressostat : sans objet pour cette installation."
                }
              ],
              "N.V": [
                {
                  "label": "Non visible",
                  "commentaire": "Pressostat : non visible ou inaccessible lors de la visite."
                }
              ]
            }
          }
        ]
      },
      "p-remar-froid": {
        "Informations du site": [
          {
            "cle": "Production froid",
            "type": "champ",
            "options": [
              "Groupe frigorifique",
              "PAC réversible",
              "Réseau de froid",
              "Détente directe"
            ],
            "semanticKey": "remar.froid.Production froid"
          },
          {
            "cle": "Type de régulation",
            "type": "champ",
            "semanticKey": "remar.froid.Type de régulation"
          },
          {
            "cle": "Situation",
            "type": "champ",
            "options": [
              "Sous-sol",
              "Rez-de-chaussée",
              "Étage",
              "Toiture",
              "Extérieur"
            ],
            "semanticKey": "remar.froid.Situation"
          },
          {
            "cle": "Accessibilité",
            "type": "champ",
            "options": [
              "Libre",
              "Clé nécessaire",
              "Accès sécurisé",
              "Accès difficile"
            ],
            "semanticKey": "remar.froid.Accessibilité"
          },
          {
            "cle": "Support anti-vibratile",
            "type": "champ",
            "semanticKey": "remar.froid.Support anti-vibratile"
          },
          {
            "cle": "Traitement acoustique",
            "type": "champ",
            "semanticKey": "remar.froid.Traitement acoustique"
          }
        ],
        "Réseaux": [
          {
            "cle": "Volume tampon",
            "type": "champ",
            "semanticKey": "remar.froid.Volume tampon"
          },
          {
            "cle": "Réseau 1",
            "type": "champ",
            "semanticKey": "remar.froid.Réseau 1"
          },
          {
            "cle": "Réseau 2",
            "type": "champ",
            "semanticKey": "remar.froid.Réseau 2"
          },
          {
            "cle": "Réseau 3",
            "type": "champ",
            "semanticKey": "remar.froid.Réseau 3"
          }
        ]
      }
    },
    "specialPanels": [
      "p-equip",
      "p-remarques",
      "p-photos"
    ],
    "dynamicPanels": {
      "p-remar-reseaux": "networks",
      "p-remar-releves": "meters"
    },
    "tabOrder": [
      "p-infos",
      "p-remar-reseaux",
      "p-conf-local",
      "p-conf-chauffage",
      "p-conf-ecs",
      "p-distrib",
      "p-remar-releves",
      "p-remar-energie",
      "p-remar-cta",
      "p-remar-filtres",
      "p-remar-cta-mesures",
      "p-remar-cta-energie",
      "p-remar-vmc",
      "p-remar-froid",
      "SEP",
      "p-equip",
      "p-remarques",
      "p-photos"
    ],
    "labels": {
      "p-infos": "Informations",
      "p-remar-reseaux": "Réseaux chauffage",
      "p-conf-local": "Conf. Local",
      "p-conf-chauffage": "Conf. Chauffage",
      "p-conf-ecs": "Conf. ECS",
      "p-distrib": "Distribution",
      "p-remar-releves": "Compteurs et températures",
      "p-remar-energie": "Améliorations chauffage",
      "p-remar-cta": "CTA",
      "p-remar-filtres": "Filtration CTA",
      "p-remar-cta-mesures": "Mesures CTA",
      "p-remar-cta-energie": "Améliorations CTA",
      "p-remar-vmc": "VMC",
      "p-remar-froid": "Production de froid",
      "p-equip": "Équipements",
      "p-remarques": "Réserves",
      "p-photos": "Photos"
    }
  },
  "excel": {
    "legacyMainSheets": ["TRAME REMAR CLASSIQUE"],
    "requiredSheets": [
      "TRAME REMAR"
    ],
    "mainSheet": "TRAME REMAR",
    "metadata": {
      "client": "B1",
      "site": "B2",
      "local": "B3",
      "type": "B4",
      "dateVisite": "B5",
      "adresse": "C14"
    },
    "fieldMappings": [
      {
        "panelId": "p-infos",
        "section": "Général",
        "sectionCode": "infos.g_n_ral",
        "cle": "Nom du client",
        "type": "champ",
        "valueCell": "B1",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Général",
        "sectionCode": "infos.g_n_ral",
        "cle": "Nom du site",
        "type": "champ",
        "valueCell": "B2",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Général",
        "sectionCode": "infos.g_n_ral",
        "cle": "Nom du local",
        "type": "champ",
        "valueCell": "B3",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Général",
        "sectionCode": "infos.g_n_ral",
        "cle": "Trame utilisée",
        "type": "champ",
        "valueCell": "B4",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Général",
        "sectionCode": "infos.g_n_ral",
        "cle": "Date de la visite",
        "type": "champ",
        "valueCell": "B5",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Date de visite",
        "type": "champ",
        "valueCell": "C12",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Nom du site",
        "type": "champ",
        "valueCell": "C13",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Adresse",
        "type": "champ",
        "valueCell": "C14",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Nb bâtiment, nb logement & surface",
        "type": "champ",
        "valueCell": "C15",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Production chauffage",
        "type": "champ",
        "valueCell": "C16",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Type de régulation",
        "type": "champ",
        "valueCell": "C17",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Production ECS",
        "type": "champ",
        "valueCell": "C18",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Situation",
        "type": "champ",
        "valueCell": "C19",
        "commentCell": null
      },
      {
        "panelId": "p-infos",
        "section": "Informations générales",
        "sectionCode": "infos.informations_g_n_rales",
        "cle": "Accessibilité",
        "type": "champ",
        "valueCell": "C20",
        "commentCell": null
      },
      {
        "panelId": "p-remar-reseaux",
        "section": "Réseaux chauffage",
        "sectionCode": "remar-reseaux.r_seaux_chauffage",
        "cle": "Réseau 1",
        "type": "champ",
        "valueCell": "C25",
        "commentCell": null
      },
      {
        "panelId": "p-remar-reseaux",
        "section": "Réseaux chauffage",
        "sectionCode": "remar-reseaux.r_seaux_chauffage",
        "cle": "Réseau 2",
        "type": "champ",
        "valueCell": "C26",
        "commentCell": null
      },
      {
        "panelId": "p-remar-reseaux",
        "section": "Réseaux chauffage",
        "sectionCode": "remar-reseaux.r_seaux_chauffage",
        "cle": "Réseau 3",
        "type": "champ",
        "valueCell": "C27",
        "commentCell": null
      },
      {
        "panelId": "p-remar-reseaux",
        "section": "Réseaux chauffage",
        "sectionCode": "remar-reseaux.r_seaux_chauffage",
        "cle": "Réseau 4",
        "type": "champ",
        "valueCell": "C28",
        "commentCell": null
      },
      {
        "panelId": "p-remar-reseaux",
        "section": "Réseaux chauffage",
        "sectionCode": "remar-reseaux.r_seaux_chauffage",
        "cle": "Réseau 5",
        "type": "champ",
        "valueCell": "C29",
        "commentCell": null
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Coupure extérieure Gaz",
        "type": "controle",
        "valueCell": "B36",
        "commentCell": "C36"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Coupure extérieure électrique",
        "type": "controle",
        "valueCell": "B37",
        "commentCell": "C37"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Porte d'accès",
        "type": "controle",
        "valueCell": "B38",
        "commentCell": "C38"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "BAES",
        "type": "controle",
        "valueCell": "B39",
        "commentCell": "C39"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Ventilation",
        "type": "controle",
        "valueCell": "B40",
        "commentCell": "C40"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Extincteurs",
        "type": "controle",
        "valueCell": "B41",
        "commentCell": "C41"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Gaine pompiers",
        "type": "controle",
        "valueCell": "B42",
        "commentCell": "C42"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Consignes de sécurité",
        "type": "controle",
        "valueCell": "B43",
        "commentCell": "C43"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Schéma hydraulique à jour",
        "type": "controle",
        "valueCell": "B44",
        "commentCell": "C44"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Armoire électrique",
        "type": "controle",
        "valueCell": "B45",
        "commentCell": "C45"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Ligne de Gaz",
        "type": "controle",
        "valueCell": "B46",
        "commentCell": "C46"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Evacuation des EU",
        "type": "controle",
        "valueCell": "B47",
        "commentCell": "C47"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Eclairage",
        "type": "controle",
        "valueCell": "B48",
        "commentCell": "C48"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Chemins de câbles électriques avec liaison équipotentiel",
        "type": "controle",
        "valueCell": "B49",
        "commentCell": "C49"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Etat du local",
        "type": "controle",
        "valueCell": "B50",
        "commentCell": "C50"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Point de puisage",
        "type": "controle",
        "valueCell": "B51",
        "commentCell": "C51"
      },
      {
        "panelId": "p-conf-local",
        "section": "Conformité Local",
        "sectionCode": "conf-local.conformit_local",
        "cle": "Calorifuge",
        "type": "controle",
        "valueCell": "B52",
        "commentCell": "C52"
      },
      {
        "panelId": "p-conf-chauffage",
        "section": "Conformité Chauffage",
        "sectionCode": "conf-chauffage.conformit_chauffage",
        "cle": "Traitement d'eau",
        "type": "controle",
        "valueCell": "B57",
        "commentCell": "C57"
      },
      {
        "panelId": "p-conf-chauffage",
        "section": "Conformité Chauffage",
        "sectionCode": "conf-chauffage.conformit_chauffage",
        "cle": "Vase d'expansion",
        "type": "controle",
        "valueCell": "B58",
        "commentCell": "C58"
      },
      {
        "panelId": "p-conf-chauffage",
        "section": "Conformité Chauffage",
        "sectionCode": "conf-chauffage.conformit_chauffage",
        "cle": "Soupape",
        "type": "controle",
        "valueCell": "B59",
        "commentCell": "C59"
      },
      {
        "panelId": "p-conf-chauffage",
        "section": "Conformité Chauffage",
        "sectionCode": "conf-chauffage.conformit_chauffage",
        "cle": "Désemboueur",
        "type": "controle",
        "valueCell": "B60",
        "commentCell": "C60"
      },
      {
        "panelId": "p-conf-chauffage",
        "section": "Conformité Chauffage",
        "sectionCode": "conf-chauffage.conformit_chauffage",
        "cle": "Conduits de fumées",
        "type": "controle",
        "valueCell": "B61",
        "commentCell": "C61"
      },
      {
        "panelId": "p-conf-chauffage",
        "section": "Conformité Chauffage",
        "sectionCode": "conf-chauffage.conformit_chauffage",
        "cle": "Disconnecteur",
        "type": "controle",
        "valueCell": "B62",
        "commentCell": "C62"
      },
      {
        "panelId": "p-conf-chauffage",
        "section": "Conformité Chauffage",
        "sectionCode": "conf-chauffage.conformit_chauffage",
        "cle": "Adoucisseur",
        "type": "controle",
        "valueCell": "B63",
        "commentCell": "C63"
      },
      {
        "panelId": "p-conf-ecs",
        "section": "Conformité ECS",
        "sectionCode": "conf-ecs.conformit_ecs",
        "cle": "Filtres",
        "type": "controle",
        "valueCell": "B68",
        "commentCell": "C68"
      },
      {
        "panelId": "p-conf-ecs",
        "section": "Conformité ECS",
        "sectionCode": "conf-ecs.conformit_ecs",
        "cle": "Produit de traitement",
        "type": "controle",
        "valueCell": "B69",
        "commentCell": "C69"
      },
      {
        "panelId": "p-conf-ecs",
        "section": "Conformité ECS",
        "sectionCode": "conf-ecs.conformit_ecs",
        "cle": "Manchettes témoins",
        "type": "controle",
        "valueCell": "B70",
        "commentCell": "C70"
      },
      {
        "panelId": "p-conf-ecs",
        "section": "Conformité ECS",
        "sectionCode": "conf-ecs.conformit_ecs",
        "cle": "Vanne de vidange sur ballon",
        "type": "controle",
        "valueCell": "B71",
        "commentCell": "C71"
      },
      {
        "panelId": "p-conf-ecs",
        "section": "Conformité ECS",
        "sectionCode": "conf-ecs.conformit_ecs",
        "cle": "Robinet de prélèvement (départ, bouclage)",
        "type": "controle",
        "valueCell": "B72",
        "commentCell": "C72"
      },
      {
        "panelId": "p-conf-ecs",
        "section": "Conformité ECS",
        "sectionCode": "conf-ecs.conformit_ecs",
        "cle": "Soupape",
        "type": "controle",
        "valueCell": "B73",
        "commentCell": "C73"
      },
      {
        "panelId": "p-conf-ecs",
        "section": "Conformité ECS",
        "sectionCode": "conf-ecs.conformit_ecs",
        "cle": "Adoucisseur",
        "type": "controle",
        "valueCell": "B74",
        "commentCell": "C74"
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution Chauffage",
        "sectionCode": "distrib.distribution_chauffage",
        "cle": "Matériaux tuyauterie",
        "type": "champ",
        "valueCell": "C81",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution Chauffage",
        "sectionCode": "distrib.distribution_chauffage",
        "cle": "Type de distribution",
        "type": "champ",
        "valueCell": "C82",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution Chauffage",
        "sectionCode": "distrib.distribution_chauffage",
        "cle": "Type d'émetteur",
        "type": "champ",
        "valueCell": "C83",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution Chauffage",
        "sectionCode": "distrib.distribution_chauffage",
        "cle": "Type de robinetterie",
        "type": "champ",
        "valueCell": "C84",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution Chauffage",
        "sectionCode": "distrib.distribution_chauffage",
        "cle": "Calorifuge (type / état)",
        "type": "champ",
        "valueCell": "C85",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution Chauffage",
        "sectionCode": "distrib.distribution_chauffage",
        "cle": "Variation de vitesse",
        "type": "champ",
        "valueCell": "C86",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution ECS",
        "sectionCode": "distrib.distribution_ecs",
        "cle": "Matériaux tuyauterie",
        "type": "champ",
        "valueCell": "C91",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution ECS",
        "sectionCode": "distrib.distribution_ecs",
        "cle": "Type de distribution",
        "type": "champ",
        "valueCell": "C92",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution ECS",
        "sectionCode": "distrib.distribution_ecs",
        "cle": "Calorifuge (type / état)",
        "type": "champ",
        "valueCell": "C93",
        "commentCell": null
      },
      {
        "panelId": "p-distrib",
        "section": "Distribution ECS",
        "sectionCode": "distrib.distribution_ecs",
        "cle": "Variation de vitesse",
        "type": "champ",
        "valueCell": "C94",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Compteur",
        "sectionCode": "remar-releves.compteur",
        "cle": "Compteur Gaz (m³)",
        "type": "champ",
        "valueCell": "C101",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Compteur",
        "sectionCode": "remar-releves.compteur",
        "cle": "Compteur d'énergie (MWh)",
        "type": "champ",
        "valueCell": "C102",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Compteur",
        "sectionCode": "remar-releves.compteur",
        "cle": "Compteur ECS (m³)",
        "type": "champ",
        "valueCell": "C103",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Compteur",
        "sectionCode": "remar-releves.compteur",
        "cle": "Compteur appoint (m³)",
        "type": "champ",
        "valueCell": "C104",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Température chaufferie",
        "sectionCode": "remar-releves.temp_rature_chaufferie",
        "cle": "Chauffage aller (°C)",
        "type": "champ",
        "valueCell": "C109",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Température chaufferie",
        "sectionCode": "remar-releves.temp_rature_chaufferie",
        "cle": "Chauffage retour (°C)",
        "type": "champ",
        "valueCell": "C110",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Température chaufferie",
        "sectionCode": "remar-releves.temp_rature_chaufferie",
        "cle": "ECS départ (°C)",
        "type": "champ",
        "valueCell": "C111",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Température chaufferie",
        "sectionCode": "remar-releves.temp_rature_chaufferie",
        "cle": "ECS bouclage (°C)",
        "type": "champ",
        "valueCell": "C112",
        "commentCell": null
      },
      {
        "panelId": "p-remar-releves",
        "section": "Température chaufferie",
        "sectionCode": "remar-releves.temp_rature_chaufferie",
        "cle": "ECS stockage (°C)",
        "type": "champ",
        "valueCell": "C113",
        "commentCell": null
      },
      {
        "panelId": "p-remar-energie",
        "section": "Chaufferie",
        "sectionCode": "remar-energie.chaufferie",
        "cle": "GTB",
        "type": "controle",
        "valueCell": "B120",
        "commentCell": "C120"
      },
      {
        "panelId": "p-remar-energie",
        "section": "Chaufferie",
        "sectionCode": "remar-energie.chaufferie",
        "cle": "Chaudière",
        "type": "controle",
        "valueCell": "B121",
        "commentCell": "C121"
      },
      {
        "panelId": "p-remar-energie",
        "section": "Chaufferie",
        "sectionCode": "remar-energie.chaufferie",
        "cle": "Brûleur",
        "type": "controle",
        "valueCell": "B122",
        "commentCell": "C122"
      },
      {
        "panelId": "p-remar-energie",
        "section": "Chaufferie",
        "sectionCode": "remar-energie.chaufferie",
        "cle": "Condensation",
        "type": "controle",
        "valueCell": "B123",
        "commentCell": "C123"
      },
      {
        "panelId": "p-remar-energie",
        "section": "Chaufferie",
        "sectionCode": "remar-energie.chaufferie",
        "cle": "Consignes / programmes",
        "type": "controle",
        "valueCell": "B124",
        "commentCell": "C124"
      },
      {
        "panelId": "p-remar-energie",
        "section": "Chaufferie",
        "sectionCode": "remar-energie.chaufferie",
        "cle": "Vannes 3 voies",
        "type": "controle",
        "valueCell": "B125",
        "commentCell": "C125"
      },
      {
        "panelId": "p-remar-cta",
        "section": "Informations techniques",
        "sectionCode": "remar-cta.informations_techniques",
        "cle": "Désignation CTA",
        "type": "champ",
        "valueCell": "C132",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta",
        "section": "Informations techniques",
        "sectionCode": "remar-cta.informations_techniques",
        "cle": "Année CTA",
        "type": "champ",
        "valueCell": "C133",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta",
        "section": "Informations techniques",
        "sectionCode": "remar-cta.informations_techniques",
        "cle": "Type traitement d'air",
        "type": "champ",
        "valueCell": "C134",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta",
        "section": "Informations techniques",
        "sectionCode": "remar-cta.informations_techniques",
        "cle": "Type de batterie",
        "type": "champ",
        "valueCell": "C135",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta",
        "section": "Informations techniques",
        "sectionCode": "remar-cta.informations_techniques",
        "cle": "Contrôle d'humidité",
        "type": "champ",
        "valueCell": "C136",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta",
        "section": "Informations techniques",
        "sectionCode": "remar-cta.informations_techniques",
        "cle": "Récupération d'énergie",
        "type": "champ",
        "valueCell": "C137",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta",
        "section": "Informations techniques",
        "sectionCode": "remar-cta.informations_techniques",
        "cle": "Raccordement GTC",
        "type": "champ",
        "valueCell": "C138",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta",
        "section": "Informations techniques",
        "sectionCode": "remar-cta.informations_techniques",
        "cle": "Exploitant - marché",
        "type": "champ",
        "valueCell": "C139",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta",
        "section": "Avis sur l’entretien général",
        "sectionCode": "remar-cta.avis_sur_l_entretien_g_n_ral",
        "cle": "Eclairage du caisson",
        "type": "controle",
        "valueCell": "B144",
        "commentCell": "C144"
      },
      {
        "panelId": "p-remar-cta",
        "section": "Avis sur l’entretien général",
        "sectionCode": "remar-cta.avis_sur_l_entretien_g_n_ral",
        "cle": "Date du dernier remplacement de filtre",
        "type": "controle",
        "valueCell": "B145",
        "commentCell": "C145"
      },
      {
        "panelId": "p-remar-cta",
        "section": "Avis sur l’entretien général",
        "sectionCode": "remar-cta.avis_sur_l_entretien_g_n_ral",
        "cle": "Date de la dernière qualification",
        "type": "controle",
        "valueCell": "B146",
        "commentCell": "C146"
      },
      {
        "panelId": "p-remar-cta",
        "section": "Avis sur l’entretien général",
        "sectionCode": "remar-cta.avis_sur_l_entretien_g_n_ral",
        "cle": "Nettoyage des gaines horizontal & vertical",
        "type": "controle",
        "valueCell": "B147",
        "commentCell": "C147"
      },
      {
        "panelId": "p-remar-cta",
        "section": "Avis sur l’entretien général",
        "sectionCode": "remar-cta.avis_sur_l_entretien_g_n_ral",
        "cle": "Calorifugeage",
        "type": "controle",
        "valueCell": "B148",
        "commentCell": "C148"
      },
      {
        "panelId": "p-remar-filtres",
        "section": "Filtre n°1",
        "sectionCode": "remar-filtres.filtre_n_1",
        "cle": "Type de filtre",
        "type": "champ",
        "valueCell": "C155",
        "commentCell": null
      },
      {
        "panelId": "p-remar-filtres",
        "section": "Filtre n°1",
        "sectionCode": "remar-filtres.filtre_n_1",
        "cle": "Etat du filtre",
        "type": "controle",
        "valueCell": "B156",
        "commentCell": "C156"
      },
      {
        "panelId": "p-remar-filtres",
        "section": "Filtre n°2",
        "sectionCode": "remar-filtres.filtre_n_2",
        "cle": "Type de filtre",
        "type": "champ",
        "valueCell": "C161",
        "commentCell": null
      },
      {
        "panelId": "p-remar-filtres",
        "section": "Filtre n°2",
        "sectionCode": "remar-filtres.filtre_n_2",
        "cle": "Etat du filtre",
        "type": "controle",
        "valueCell": "B162",
        "commentCell": "C162"
      },
      {
        "panelId": "p-remar-filtres",
        "section": "Filtre n°3",
        "sectionCode": "remar-filtres.filtre_n_3",
        "cle": "Type de filtre",
        "type": "champ",
        "valueCell": "C167",
        "commentCell": null
      },
      {
        "panelId": "p-remar-filtres",
        "section": "Filtre n°3",
        "sectionCode": "remar-filtres.filtre_n_3",
        "cle": "Etat du filtre",
        "type": "controle",
        "valueCell": "B168",
        "commentCell": "C168"
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Températures",
        "sectionCode": "remar-cta-mesures.temp_ratures",
        "cle": "Air neuf",
        "type": "champ",
        "valueCell": "C175",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Températures",
        "sectionCode": "remar-cta-mesures.temp_ratures",
        "cle": "Après récupération",
        "type": "champ",
        "valueCell": "C176",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Températures",
        "sectionCode": "remar-cta-mesures.temp_ratures",
        "cle": "Soufflage",
        "type": "champ",
        "valueCell": "C177",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Températures",
        "sectionCode": "remar-cta-mesures.temp_ratures",
        "cle": "Extraction / Reprise",
        "type": "champ",
        "valueCell": "C178",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Variation de vitesse",
        "sectionCode": "remar-cta-mesures.variation_de_vitesse",
        "cle": "Soufflage",
        "type": "champ",
        "valueCell": "C183",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Variation de vitesse",
        "sectionCode": "remar-cta-mesures.variation_de_vitesse",
        "cle": "Extraction / Reprise",
        "type": "champ",
        "valueCell": "C184",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Consignes",
        "sectionCode": "remar-cta-mesures.consignes",
        "cle": "Soufflage",
        "type": "champ",
        "valueCell": "C189",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Consignes",
        "sectionCode": "remar-cta-mesures.consignes",
        "cle": "Extraction / Reprise",
        "type": "champ",
        "valueCell": "C190",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-mesures",
        "section": "Consignes",
        "sectionCode": "remar-cta-mesures.consignes",
        "cle": "Pression",
        "type": "champ",
        "valueCell": "C191",
        "commentCell": null
      },
      {
        "panelId": "p-remar-cta-energie",
        "section": "CTA",
        "sectionCode": "remar-cta-energie.cta",
        "cle": "GTB",
        "type": "controle",
        "valueCell": "B198",
        "commentCell": "C198"
      },
      {
        "panelId": "p-remar-cta-energie",
        "section": "CTA",
        "sectionCode": "remar-cta-energie.cta",
        "cle": "Variateur",
        "type": "controle",
        "valueCell": "B199",
        "commentCell": "C199"
      },
      {
        "panelId": "p-remar-cta-energie",
        "section": "CTA",
        "sectionCode": "remar-cta-energie.cta",
        "cle": "Efficacité du récupérateur",
        "type": "controle",
        "valueCell": "B200",
        "commentCell": "C200"
      },
      {
        "panelId": "p-remar-cta-energie",
        "section": "CTA",
        "sectionCode": "remar-cta-energie.cta",
        "cle": "Efficacité des moteurs",
        "type": "controle",
        "valueCell": "B201",
        "commentCell": "C201"
      },
      {
        "panelId": "p-remar-cta-energie",
        "section": "CTA",
        "sectionCode": "remar-cta-energie.cta",
        "cle": "Consignes / programmes",
        "type": "controle",
        "valueCell": "B202",
        "commentCell": "C202"
      },
      {
        "panelId": "p-remar-cta-energie",
        "section": "CTA",
        "sectionCode": "remar-cta-energie.cta",
        "cle": "Vannes de régulation",
        "type": "controle",
        "valueCell": "B203",
        "commentCell": "C203"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Informations générales",
        "sectionCode": "remar-vmc.informations_g_n_rales",
        "cle": "Type de ventilation",
        "type": "champ",
        "valueCell": "C210",
        "commentCell": null
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Informations générales",
        "sectionCode": "remar-vmc.informations_g_n_rales",
        "cle": "Nombre de caissons",
        "type": "champ",
        "valueCell": "C211",
        "commentCell": null
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Informations générales",
        "sectionCode": "remar-vmc.informations_g_n_rales",
        "cle": "Type de bouche",
        "type": "champ",
        "valueCell": "C212",
        "commentCell": null
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Situation",
        "sectionCode": "remar-vmc.situation",
        "cle": "Situation du caisson",
        "type": "controle",
        "valueCell": "B219",
        "commentCell": "C219"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Situation",
        "sectionCode": "remar-vmc.situation",
        "cle": "Accès au caisson",
        "type": "controle",
        "valueCell": "B220",
        "commentCell": "C220"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Situation",
        "sectionCode": "remar-vmc.situation",
        "cle": "Garde-corps / ligne de vie",
        "type": "controle",
        "valueCell": "B221",
        "commentCell": "C221"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Caisson",
        "sectionCode": "remar-vmc.caisson",
        "cle": "Etat du caisson",
        "type": "controle",
        "valueCell": "B226",
        "commentCell": "C226"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Caisson",
        "sectionCode": "remar-vmc.caisson",
        "cle": "Fonctionnement",
        "type": "controle",
        "valueCell": "B227",
        "commentCell": "C227"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Caisson",
        "sectionCode": "remar-vmc.caisson",
        "cle": "Nettoyage caisson",
        "type": "controle",
        "valueCell": "B228",
        "commentCell": "C228"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Caisson",
        "sectionCode": "remar-vmc.caisson",
        "cle": "Etat courroie",
        "type": "controle",
        "valueCell": "B229",
        "commentCell": "C229"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Caisson",
        "sectionCode": "remar-vmc.caisson",
        "cle": "Coupure électrique",
        "type": "controle",
        "valueCell": "B230",
        "commentCell": "C230"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Etat manchette",
        "type": "controle",
        "valueCell": "B235",
        "commentCell": "C235"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Etat extérieur traînasse",
        "type": "controle",
        "valueCell": "B236",
        "commentCell": "C236"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Etanchéité traînasse",
        "type": "controle",
        "valueCell": "B237",
        "commentCell": "C237"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Nettoyage traînasse",
        "type": "controle",
        "valueCell": "B238",
        "commentCell": "C238"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Pied de soutien",
        "type": "controle",
        "valueCell": "B239",
        "commentCell": "C239"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Registre",
        "type": "controle",
        "valueCell": "B240",
        "commentCell": "C240"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Trappe de visite",
        "type": "controle",
        "valueCell": "B241",
        "commentCell": "C241"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Chapeau",
        "type": "controle",
        "valueCell": "B242",
        "commentCell": "C242"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Distribution",
        "sectionCode": "remar-vmc.distribution",
        "cle": "Nettoyage colonne",
        "type": "controle",
        "valueCell": "B243",
        "commentCell": "C243"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Gestion",
        "sectionCode": "remar-vmc.gestion",
        "cle": "Télégestion",
        "type": "controle",
        "valueCell": "B248",
        "commentCell": "C248"
      },
      {
        "panelId": "p-remar-vmc",
        "section": "Gestion",
        "sectionCode": "remar-vmc.gestion",
        "cle": "Pressostat",
        "type": "controle",
        "valueCell": "B249",
        "commentCell": "C249"
      },
      {
        "panelId": "p-remar-froid",
        "section": "Informations du site",
        "sectionCode": "remar-froid.informations_du_site",
        "cle": "Production froid",
        "type": "champ",
        "valueCell": "C256",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Informations du site",
        "sectionCode": "remar-froid.informations_du_site",
        "cle": "Type de régulation",
        "type": "champ",
        "valueCell": "C257",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Informations du site",
        "sectionCode": "remar-froid.informations_du_site",
        "cle": "Situation",
        "type": "champ",
        "valueCell": "C258",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Informations du site",
        "sectionCode": "remar-froid.informations_du_site",
        "cle": "Accessibilité",
        "type": "champ",
        "valueCell": "C259",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Informations du site",
        "sectionCode": "remar-froid.informations_du_site",
        "cle": "Support anti-vibratile",
        "type": "champ",
        "valueCell": "C260",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Informations du site",
        "sectionCode": "remar-froid.informations_du_site",
        "cle": "Traitement acoustique",
        "type": "champ",
        "valueCell": "C261",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Réseaux",
        "sectionCode": "remar-froid.r_seaux",
        "cle": "Volume tampon",
        "type": "champ",
        "valueCell": "C266",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Réseaux",
        "sectionCode": "remar-froid.r_seaux",
        "cle": "Réseau 1",
        "type": "champ",
        "valueCell": "C267",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Réseaux",
        "sectionCode": "remar-froid.r_seaux",
        "cle": "Réseau 2",
        "type": "champ",
        "valueCell": "C268",
        "commentCell": null
      },
      {
        "panelId": "p-remar-froid",
        "section": "Réseaux",
        "sectionCode": "remar-froid.r_seaux",
        "cle": "Réseau 3",
        "type": "champ",
        "valueCell": "C269",
        "commentCell": null
      }
    ],
    "tables": {
      "materiel": {
        "sheet": "MATERIEL",
        "startRow": 4,
        "maxImportRow": 500,
        "columns": [
          [
            "A",
            "categorie"
          ],
          [
            "B",
            "nombre"
          ],
          [
            "C",
            "designation"
          ],
          [
            "D",
            "numero"
          ],
          [
            "E",
            "reseau"
          ],
          [
            "F",
            "marque"
          ],
          [
            "G",
            "modele"
          ],
          [
            "H",
            "caracteristiques"
          ],
          [
            "I",
            "annee"
          ],
          [
            "J",
            "etat"
          ]
        ],
        "exportColumns": [
          [
            "A",
            "categorie"
          ],
          [
            "B",
            "nombre"
          ],
          [
            "C",
            "designation"
          ],
          [
            "D",
            "numero_materiel"
          ],
          [
            "E",
            "reseau_desservi"
          ],
          [
            "F",
            "marque"
          ],
          [
            "G",
            "modele"
          ],
          [
            "H",
            "caracteristiques"
          ],
          [
            "I",
            "annee"
          ],
          [
            "J",
            "etat"
          ]
        ]
      },
      "remarques": {
        "sheet": "REMARQUES",
        "startRow": 4,
        "maxImportRow": 500,
        "columns": [
          [
            "A",
            "poste"
          ],
          [
            "B",
            "prestation"
          ],
          [
            "C",
            "date_reserve"
          ],
          [
            "D",
            "delai"
          ],
          [
            "E",
            "intranet_etat_avancement"
          ],
          [
            "F",
            "estimatif"
          ]
        ],
        "exportColumns": [
          [
            "A",
            "poste"
          ],
          [
            "B",
            "prestation"
          ],
          [
            "C",
            "date_reserve"
          ],
          [
            "D",
            "delai"
          ],
          [
            "E",
            "intranet_etat_avancement"
          ],
          [
            "F",
            "estimatif"
          ]
        ]
      },
      "note": {
        "sheet": "NOTE",
        "cell": "A2"
      }
    }
  }
};
definition.excel.templateBase64 = TEMPLATE_REMAR_BASE64;
export const REMAR = definition;
