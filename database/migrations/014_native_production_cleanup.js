export const migration014 = {
  version: 14,
  name: 'native_production_cleanup',
  sql: `
    -- La branche native ne doit jamais injecter les clients/sites de démonstration.
    -- db.js vérifie cette clé avant le seed historique : la poser en migration
    -- permet de neutraliser le seed avant le premier getDb() d'une installation neuve.
    INSERT INTO _meta (key, value)
    VALUES ('demo_seeded', 'production-disabled')
    ON CONFLICT(key) DO UPDATE SET value='production-disabled';

    -- Nettoyage prudent des données de démonstration sur les installations de test
    -- déjà ouvertes : uniquement si aucune visite réelle n'est rattachée au site.
    DELETE FROM sites
    WHERE id IN (
      SELECT s.id
      FROM sites s
      JOIN clients c ON c.id=s.client_id
      WHERE c.code_exploitant='RLP01'
        AND c.nom='Résidence Les Pins'
        AND s.nom_site='Chaufferie centrale'
        AND s.adresse='12 rue des Tilleuls'
        AND NOT EXISTS (SELECT 1 FROM visites v WHERE v.site_id=s.id)
    );

    DELETE FROM clients
    WHERE code_exploitant='RLP01'
      AND nom='Résidence Les Pins'
      AND adresse='12 rue des Tilleuls'
      AND NOT EXISTS (SELECT 1 FROM sites s WHERE s.client_id=clients.id);

    DELETE FROM clients
    WHERE code_exploitant='OHC08'
      AND nom='Office HLM Colombes'
      AND adresse='5 avenue de la République'
      AND NOT EXISTS (SELECT 1 FROM sites s WHERE s.client_id=clients.id);
  `,
};
