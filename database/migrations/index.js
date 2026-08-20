import { migration001 } from './001_legacy_schema.js';
import { migration002 } from './002_domain_foundations.js';
import { migration003 } from './003_equipment_catalog.js';
import { migration004 } from './004_persistent_equipment.js';

export const MIGRATIONS = Object.freeze([migration001, migration002, migration003, migration004]);
