import { migration001 } from './001_legacy_schema.js';
import { migration002 } from './002_domain_foundations.js';

export const MIGRATIONS = Object.freeze([migration001, migration002]);
