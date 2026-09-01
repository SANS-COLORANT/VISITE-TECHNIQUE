export const migration020 = {
  version: 20,
  name: 'site_plan',
  sql: `
    ALTER TABLE sites ADD COLUMN plan_uri TEXT;
  `,
};
