function sectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

async function insertIfEmpty(db, visiteId, panelId, section, cle, valeur) {
  if (valeur === null || valeur === undefined || String(valeur).trim() === '') return;
  await db.runAsync(
    `INSERT INTO champs_visite(visite_id,section_code,cle,valeur)
     VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur
     WHERE champs_visite.valeur IS NULL OR trim(champs_visite.valeur)=''`,
    [visiteId, sectionCode(panelId, section), cle, String(valeur)]
  );
}

function formatHeure(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

export async function preremplirVisiteDepuisContexte(db, visiteId) {
  const contexte = await db.getFirstAsync(
    `SELECT v.id,v.date_visite,v.technicien,v.mode_visite,
            s.id site_id,s.nom_site,s.adresse,s.localisation_note,
            c.id client_id,c.nom nom_client,c.code_exploitant
     FROM visites v
     JOIN sites s ON s.id=v.site_id
     JOIN clients c ON c.id=s.client_id
     WHERE v.id=?`,
    [visiteId]
  );
  if (!contexte) return;

  const maintenant = new Date();
  const dateVisite = contexte.date_visite || maintenant.toISOString().slice(0, 10);
  const nomLocal = contexte.localisation_note || null;

  const fixes = [
    ['p-infos', 'Général', 'Nom du client', contexte.nom_client],
    ['p-infos', 'Général', 'Nom du site', contexte.nom_site],
    ['p-infos', 'Général', 'Nom du local', nomLocal],
    ['p-infos', 'Général', 'Trame utilisée', 'Trame ICPE'],
    ['p-infos', 'Général', 'Date de la visite', dateVisite],
    ['p-infos', 'Informations générales', 'Date de visite', dateVisite],
    ['p-infos', 'Informations générales', 'Heure de visite', formatHeure(maintenant)],
    ['p-infos', 'Informations générales', 'Nom du site', contexte.nom_site],
    ['p-infos', 'Informations générales', 'Adresse', contexte.adresse],
  ];
  for (const [panel, section, cle, valeur] of fixes) {
    await insertIfEmpty(db, visiteId, panel, section, cle, valeur);
  }

  const equipements = await db.getAllAsync(
    `SELECT e.* FROM equipements e
     JOIN installations i ON i.id=e.installation_id
     WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'`,
    [contexte.site_id]
  );
  if (equipements.length) {
    await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', "Nb d'équipements", equipements.length);
    const types = [...new Set(equipements.map((e) => String(e.type_code || '').trim()).filter(Boolean))];
    if (types.length === 1) {
      await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', 'Production primaire', types[0]);
    }
  }

  const precedente = await db.getFirstAsync(
    `SELECT id FROM visites
     WHERE site_id=? AND id<>?
     ORDER BY COALESCE(date_visite,'') DESC, modifie_le DESC LIMIT 1`,
    [contexte.site_id, visiteId]
  );
  if (precedente) {
    const clesStables = [
      ['p-infos', 'Informations générales', 'Nbr de bât / lgt'],
      ['p-infos', 'Informations générales', 'Exploitant - marché'],
      ['p-infos', 'Informations générales', 'Type de LT'],
      ['p-infos', 'Description des principaux équipements', 'Production primaire'],
      ['p-infos', 'Description des principaux équipements', 'Type de régulation'],
      ['p-infos', 'Description des principaux équipements', 'Production ECS'],
    ];
    for (const [panel, section, cle] of clesStables) {
      const code = sectionCode(panel, section);
      const ancien = await db.getFirstAsync(
        `SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`,
        [precedente.id, code, cle]
      );
      if (ancien?.valeur) await insertIfEmpty(db, visiteId, panel, section, cle, ancien.valeur);
    }
  }
}
