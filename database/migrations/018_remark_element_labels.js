export const migration018 = {
  version: 18,
  name: 'remark_element_labels',
  sql: `
    UPDATE remarques
    SET reference_type = COALESCE(reference_type, 'controle'),
        reference_id = COALESCE(reference_id, controle_key),
        reference_libelle = CASE
          WHEN reference_libelle IS NULL OR TRIM(reference_libelle) = '' THEN
            CASE
              WHEN instr(controle_key, '||') > 0
                THEN substr(controle_key, instr(controle_key, '||') + 2)
              ELSE controle_key
            END
          ELSE reference_libelle
        END
    WHERE controle_key IS NOT NULL
      AND TRIM(controle_key) <> '';
  `,
};
