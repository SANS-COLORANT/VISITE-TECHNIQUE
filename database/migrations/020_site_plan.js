export const migration020 = {
  id: 20,
  name: 'site_plan',
  async up(db) {
    await db.execAsync(`ALTER TABLE sites ADD COLUMN plan_uri TEXT;`);
  },
};
