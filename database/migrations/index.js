import { migration001 } from './001_legacy_schema.js';
import { migration002 } from './002_domain_foundations.js';
import { migration003 } from './003_equipment_catalog.js';
import { migration004 } from './004_persistent_equipment.js';
import { migration005 } from './005_persistent_networks_meters.js';
import { migration006 } from './006_remark_links.js';
import { migration007 } from './007_express_visits.js';
import { migration008 } from './008_equipment_reference_details.js';
import { migration009 } from './009_catalog_provenance_media.js';
import { migration010 } from './010_catalog_search_indexes.js';
import { migration011 } from './011_catalog_experience.js';
import { migration012 } from './012_site_geolocation.js';
import { migration013 } from './013_material_excel_fields.js';
import { migration014 } from './014_native_production_cleanup.js';
import { migration015 } from './015_visit_runtime_indexes.js';
import { migration016 } from './016_visit_template_id.js';
import { migration017 } from './017_patrimoine_history.js';
import { migration018 } from './018_remark_element_labels.js';
import { migration019 } from './019_equipment_trame_usage.js';
import { migration020 } from './020_site_plan.js';
import { migration021 } from './021_pre_allumage_modular.js';
import { migration022 } from './022_lab_3d_site.js';
import { migration023 } from './023_reserve_severity.js';
import { migration024 } from './024_site_groups.js';

export const MIGRATIONS = Object.freeze([
  migration001, migration002, migration003, migration004, migration005,
  migration006, migration007, migration008, migration009, migration010,
  migration011, migration012, migration013, migration014, migration015,
  migration016, migration017, migration018, migration019, migration020,
  migration021, migration022, migration023, migration024,
]);
