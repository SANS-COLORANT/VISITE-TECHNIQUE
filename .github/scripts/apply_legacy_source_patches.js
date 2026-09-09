const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const PATCHES = [
  ['latest API visit import', '.github/scripts/patch_latest_api_visit_import.js'],
  ['client multi-site import', '.github/scripts/patch_client_multi_site_import.js'],
  ['latest API visit fields', '.github/scripts/patch_latest_api_visit_fields.js'],
  ['large-client performance', '.github/scripts/patch_large_client_performance.js'],
  ['large-client queries', '.github/scripts/patch_large_client_queries.js'],
  ['directory fast cache', '.github/scripts/patch_directory_fast_cache.js'],
  ['runtime responsiveness v3', '.github/scripts/patch_runtime_responsiveness_v3.js'],
  ['startup dependency graph', '.github/scripts/patch_startup_dependency_graph.js'],
  ['client site preview layout', '.github/scripts/patch_client_site_preview_layout.js'],
  ['report export workflow', '.github/scripts/patch_report_export_workflow.js'],
];

function run(args, label) {
  console.log(`\n[METRA legacy] ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    console.error(`[METRA legacy] ${label} failed. This recovery path is intended only for an old, unmaterialized checkout.`);
    process.exit(result.status || 1);
  }
}

console.log('[METRA legacy] Explicit recovery mode. This command mutates runtime source and must never run automatically during npm install or Android CI.');
for (const [label, script] of PATCHES) run([script], `patch: ${label}`);
run(['.github/scripts/run_source_patches.js'], 'verify materialized runtime source');
console.log('\n[METRA legacy] Legacy source recovery completed. Review and commit the resulting source before building.');
