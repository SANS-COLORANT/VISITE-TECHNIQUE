export const migration035 = {
  version: 35,
  name: 'intranet_content_revision',
  sql: `
    -- Deux compteurs permettent de savoir sans ambiguïté si le contenu métier
    -- courant correspond encore au dernier accusé de réception Intranet.
    -- Contrairement à un simple booléen, une modification effectuée pendant un
    -- envoi ne peut pas être effacée par l'accusé de réception de l'ancien payload.
    ALTER TABLE visites ADD COLUMN api_content_revision INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE visites ADD COLUMN api_synced_revision INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE api_visit_outbox ADD COLUMN content_revision INTEGER NOT NULL DEFAULT 0;

    -- Les visites historiques importées et les visites déjà synchronisées au
    -- moment de la migration sont considérées alignées avec l'Intranet.
    UPDATE visites
    SET api_content_revision = 1,
        api_synced_revision = 1
    WHERE EXISTS (
      SELECT 1 FROM provenances p
      WHERE p.entite_type='visite' AND p.entite_id=visites.id AND p.origine='api_symfony'
        AND p.details_json LIKE '%\"sourceType\":\"imported_latest_visit\"%'
    ) OR EXISTS (
      SELECT 1 FROM api_visit_outbox o
      WHERE o.visite_id=visites.id AND o.status='synced'
    );

    UPDATE api_visit_outbox
    SET content_revision = 1
    WHERE status='synced';

    -- Métadonnées de visite effectivement envoyées par POST /visites.
    CREATE TRIGGER IF NOT EXISTS trg_visite_business_revision_update
    AFTER UPDATE OF date_visite, statut, technicien, trame_id, installation_id ON visites
    WHEN COALESCE(OLD.date_visite,'') IS NOT COALESCE(NEW.date_visite,'')
      OR COALESCE(OLD.statut,'') IS NOT COALESCE(NEW.statut,'')
      OR COALESCE(OLD.technicien,'') IS NOT COALESCE(NEW.technicien,'')
      OR COALESCE(OLD.trame_id,'') IS NOT COALESCE(NEW.trame_id,'')
      OR COALESCE(OLD.installation_id,'') IS NOT COALESCE(NEW.installation_id,'')
    BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.id;
    END;

    -- Champs génériques.
    CREATE TRIGGER IF NOT EXISTS trg_champs_visite_revision_insert
    AFTER INSERT ON champs_visite BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_champs_visite_revision_update
    AFTER UPDATE OF valeur ON champs_visite
    WHEN COALESCE(OLD.valeur,'') IS NOT COALESCE(NEW.valeur,'') BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_champs_visite_revision_delete
    AFTER DELETE ON champs_visite BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=OLD.visite_id;
    END;

    -- Conformités / contrôles.
    CREATE TRIGGER IF NOT EXISTS trg_controles_visite_revision_insert
    AFTER INSERT ON controles_visite BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_controles_visite_revision_update
    AFTER UPDATE OF avis, commentaire ON controles_visite
    WHEN COALESCE(OLD.avis,'') IS NOT COALESCE(NEW.avis,'')
      OR COALESCE(OLD.commentaire,'') IS NOT COALESCE(NEW.commentaire,'') BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_controles_visite_revision_delete
    AFTER DELETE ON controles_visite BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=OLD.visite_id;
    END;

    -- Réseaux et compteurs, repris dans les critères Intranet.
    CREATE TRIGGER IF NOT EXISTS trg_reseaux_revision_insert
    AFTER INSERT ON reseaux BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_reseaux_revision_update
    AFTER UPDATE OF ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire ON reseaux
    WHEN COALESCE(OLD.ordre,-1) IS NOT COALESCE(NEW.ordre,-1)
      OR COALESCE(OLD.nom_reseau,'') IS NOT COALESCE(NEW.nom_reseau,'')
      OR COALESCE(OLD.t_ext_c,'') IS NOT COALESCE(NEW.t_ext_c,'')
      OR COALESCE(OLD.t_dep_c,'') IS NOT COALESCE(NEW.t_dep_c,'')
      OR COALESCE(OLD.courbe_de_chauffe,'') IS NOT COALESCE(NEW.courbe_de_chauffe,'')
      OR COALESCE(OLD.tnc,'') IS NOT COALESCE(NEW.tnc,'')
      OR COALESCE(OLD.consigne_programme_horaire,'') IS NOT COALESCE(NEW.consigne_programme_horaire,'') BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_reseaux_revision_delete
    AFTER DELETE ON reseaux BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=OLD.visite_id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_compteurs_revision_insert
    AFTER INSERT ON compteurs BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_compteurs_revision_update
    AFTER UPDATE OF label,valeur,unite ON compteurs
    WHEN COALESCE(OLD.label,'') IS NOT COALESCE(NEW.label,'')
      OR COALESCE(OLD.valeur,'') IS NOT COALESCE(NEW.valeur,'')
      OR COALESCE(OLD.unite,'') IS NOT COALESCE(NEW.unite,'') BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_compteurs_revision_delete
    AFTER DELETE ON compteurs BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=OLD.visite_id;
    END;

    -- Réserves : uniquement les colonnes réellement transmises à Symfony.
    CREATE TRIGGER IF NOT EXISTS trg_remarques_revision_insert
    AFTER INSERT ON remarques BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_remarques_revision_update
    AFTER UPDATE OF poste,prestation,estimatif,intranet_date_reserve,intranet_delai,intranet_etat_avancement ON remarques
    WHEN COALESCE(OLD.poste,'') IS NOT COALESCE(NEW.poste,'')
      OR COALESCE(OLD.prestation,'') IS NOT COALESCE(NEW.prestation,'')
      OR COALESCE(OLD.estimatif,'') IS NOT COALESCE(NEW.estimatif,'')
      OR COALESCE(OLD.intranet_date_reserve,'') IS NOT COALESCE(NEW.intranet_date_reserve,'')
      OR COALESCE(OLD.intranet_delai,'') IS NOT COALESCE(NEW.intranet_delai,'')
      OR COALESCE(OLD.intranet_etat_avancement,'') IS NOT COALESCE(NEW.intranet_etat_avancement,'') BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_remarques_revision_delete
    AFTER DELETE ON remarques BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=OLD.visite_id;
    END;

    -- Listing matériel envoyé intégralement au serveur.
    CREATE TRIGGER IF NOT EXISTS trg_materiel_revision_insert
    AFTER INSERT ON materiel BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_materiel_revision_update
    AFTER UPDATE OF categorie,nombre,designation,numero_materiel,reseau_desservi,marque,modele,caracteristiques,annee,etat ON materiel
    WHEN COALESCE(OLD.categorie,'') IS NOT COALESCE(NEW.categorie,'')
      OR COALESCE(OLD.nombre,'') IS NOT COALESCE(NEW.nombre,'')
      OR COALESCE(OLD.designation,'') IS NOT COALESCE(NEW.designation,'')
      OR COALESCE(OLD.numero_materiel,'') IS NOT COALESCE(NEW.numero_materiel,'')
      OR COALESCE(OLD.reseau_desservi,'') IS NOT COALESCE(NEW.reseau_desservi,'')
      OR COALESCE(OLD.marque,'') IS NOT COALESCE(NEW.marque,'')
      OR COALESCE(OLD.modele,'') IS NOT COALESCE(NEW.modele,'')
      OR COALESCE(OLD.caracteristiques,'') IS NOT COALESCE(NEW.caracteristiques,'')
      OR COALESCE(OLD.annee,'') IS NOT COALESCE(NEW.annee,'')
      OR COALESCE(OLD.etat,'') IS NOT COALESCE(NEW.etat,'') BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_materiel_revision_delete
    AFTER DELETE ON materiel BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=OLD.visite_id;
    END;

    -- Note libre envoyée dans notes[].
    CREATE TRIGGER IF NOT EXISTS trg_notes_revision_insert
    AFTER INSERT ON notes BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_notes_revision_update
    AFTER UPDATE OF contenu ON notes
    WHEN COALESCE(OLD.contenu,'') IS NOT COALESCE(NEW.contenu,'') BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_notes_revision_delete
    AFTER DELETE ON notes BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=OLD.visite_id;
    END;

    -- L'import de la dernière visite écrit ses champs avant sa provenance. La
    -- provenance importée constitue donc le point exact où le contenu local est
    -- réputé identique à l'Intranet, même après un réimport.
    CREATE TRIGGER IF NOT EXISTS trg_imported_visit_revision_insert
    AFTER INSERT ON provenances
    WHEN NEW.entite_type='visite' AND NEW.origine='api_symfony'
      AND NEW.details_json LIKE '%\"sourceType\":\"imported_latest_visit\"%'
    BEGIN
      UPDATE visites SET api_synced_revision=api_content_revision WHERE id=NEW.entite_id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_imported_visit_revision_update
    AFTER UPDATE OF details_json,importe_le ON provenances
    WHEN NEW.entite_type='visite' AND NEW.origine='api_symfony'
      AND NEW.details_json LIKE '%\"sourceType\":\"imported_latest_visit\"%'
    BEGIN
      UPDATE visites SET api_synced_revision=api_content_revision WHERE id=NEW.entite_id;
    END;
  `,
};