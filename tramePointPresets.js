/** Commentaires proposés après un choix explicite d’avis. */
export function defaultPointPresets(label) {
  return {
    S: [{ label: 'Satisfaisant', commentaire: `${label} : état satisfaisant au contrôle.` }],
    'N.S': [{ label: 'Anomalie', commentaire: `${label} : anomalie constatée, à préciser.`, reserve: `${label} : intervention à préciser.` }],
    'N.R': [{ label: 'Non réalisé', commentaire: `${label} : contrôle non réalisé, motif à préciser.` }],
    'S.O': [{ label: 'Sans objet', commentaire: `${label} : sans objet pour cette installation.` }],
    'N.V': [{ label: 'Non visible', commentaire: `${label} : non visible ou inaccessible.` }],
  };
}
