/**
 * ECS loops are not outdoor-temperature compensated heating circuits.
 * An independent return/bouclage reading must never be stored as t_ext_c.
 * Additive migration only; existing 49 versions and values are unchanged.
 */
export const migration050 = {
  version: 50,
  name: 'ecs_loop_return_temperature',
  sql: `
    ALTER TABLE reseaux ADD COLUMN t_retour_ecs_c TEXT;
    ALTER TABLE observations_reseau ADD COLUMN t_retour_ecs_c TEXT;
  `,
};
