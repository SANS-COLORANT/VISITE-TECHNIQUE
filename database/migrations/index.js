import { migration001 } from './001_legacy_schema.js';
import { migration002 } from './002_domain_foundations.js';
import { migration003 } from './003_equipment_catalog.js';
import { migration004 } from './004_persistent_equipment.js';
import { migration005 } from './005_persistent_networks_meters.js';
import { migration006 } from './006_remark_links.js';
import { migration007 } from './007_express_visits.js';
import { migration008 } from './008_equipment_reference_details.js';
import { migration009 } from './009_catalog_provenance_media.js';

export const MIGRATIONS = Object.freeze([migration001, migration002, migration003, migration004, migration005, migration006, migration007, migration008, migration009]);
