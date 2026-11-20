const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Play security baseline: never allow Android cloud/device-transfer backup of
// visits, photos, SQLite databases, tokens or other app-private files.
// Do not disable a legitimate user-initiated export without an app-side guard.
module.exports = function withMetraPlaySecurity(config) {
  config = withAndroidManifest(config, (cfg) => {
    const apps = cfg.modResults.manifest.application || [];
    if (apps.length !== 1 || !apps[0].$) {
      throw new Error('METRA security: application Android manifest inaccessible');
    }
    Object.assign(apps[0].$, {
      'android:allowBackup': 'false',
      'android:fullBackupContent': 'false',
      'android:dataExtractionRules': '@xml/metra_data_extraction_rules',
      'android:usesCleartextTraffic': 'false',
    });
    return cfg;
  });

  return withDangerousMod(config, ['android', async (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(dir, { recursive: true });
    // Explicitly exclude BOTH cloud and cable/device-to-device transfer.
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<data-extraction-rules>',
      '  <cloud-backup>',
      '    <exclude domain="root" path="." />',
      '  </cloud-backup>',
      '  <device-transfer>',
      '    <exclude domain="root" path="." />',
      '  </device-transfer>',
      '</data-extraction-rules>',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'metra_data_extraction_rules.xml'), xml);
    return cfg;
  }]);
};
