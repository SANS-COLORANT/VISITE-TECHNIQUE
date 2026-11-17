/** Additive, non-destructive ECS storage-temperature migration. */
export const migration051 = {
  version: 51,
  name: 'ecs_storage_temperature',
  sql: `
    ALTER TABLE reseaux ADD COLUMN t_stockage_ecs_c TEXT;
    ALTER TABLE observations_reseau ADD COLUMN t_stockage_ecs_c TEXT;
  `,
};
