export const migration034 = {
  version: 34,
  name: 'intranet_local_name_sync',
  sql: `
    -- Le nom du local Intranet est la référence de désignation de l'installation
    -- METRA qui lui est liée. On aligne d'abord les bases déjà existantes.
    UPDATE installations
    SET nom = (
          SELECT l.designation
          FROM api_local_links l
          WHERE l.local_installation_id = installations.id
            AND trim(COALESCE(l.designation, '')) <> ''
          ORDER BY COALESCE(l.synced_at, '') DESC
          LIMIT 1
        ),
        modifie_le = datetime('now')
    WHERE EXISTS (
      SELECT 1
      FROM api_local_links l
      WHERE l.local_installation_id = installations.id
        AND trim(COALESCE(l.designation, '')) <> ''
    );

    -- Lorsqu'un import rattache pour la première fois un LOCAL à une
    -- installation déjà créée, sa désignation Intranet devient immédiatement
    -- le nom affiché dans METRA.
    CREATE TRIGGER IF NOT EXISTS trg_api_local_insert_sync_installation_name
    AFTER INSERT ON api_local_links
    WHEN NEW.local_installation_id IS NOT NULL
      AND trim(COALESCE(NEW.designation, '')) <> ''
    BEGIN
      UPDATE installations
      SET nom = NEW.designation,
          modifie_le = datetime('now')
      WHERE id = NEW.local_installation_id;
    END;

    -- Les réimports / actualisations restent synchronisés : si le nom du local
    -- change côté Intranet, ou si le lien local_installation_id est posé après
    -- le cache de préparation, METRA reprend la nouvelle désignation.
    CREATE TRIGGER IF NOT EXISTS trg_api_local_update_sync_installation_name
    AFTER UPDATE OF local_installation_id, designation ON api_local_links
    WHEN NEW.local_installation_id IS NOT NULL
      AND trim(COALESCE(NEW.designation, '')) <> ''
    BEGIN
      UPDATE installations
      SET nom = NEW.designation,
          modifie_le = datetime('now')
      WHERE id = NEW.local_installation_id;
    END;
  `,
};
