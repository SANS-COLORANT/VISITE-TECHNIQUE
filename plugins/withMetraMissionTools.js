const { withDangerousMod, withMainApplication, withAppBuildGradle, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const IMPORT = 'import com.metra.missiontools.MetraMissionToolsPackage';
const KOTLIN_TOKEN = 'PackageList(this).packages';
const KOTLIN_WRAPPED = 'PackageList(this).packages.apply { add(MetraMissionToolsPackage()) }';
const MLKIT_DEP = "implementation 'com.google.mlkit:text-recognition:16.0.1'";

module.exports = function withMetraMissionTools(config) {
  config = withDangerousMod(config, ['android', async (cfg) => {
    const sourceDir = path.join(cfg.modRequest.projectRoot, 'native', 'metra-mission-tools');
    const targetDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', 'com', 'metra', 'missiontools');
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of ['MetraOcrModule.kt', 'MetraSpeechModule.kt', 'MetraPdfModule.kt', 'MetraGeoPackageModule.kt', 'MetraMissionToolsPackage.kt']) {
      fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
    }
    return cfg;
  }]);

  config = withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes(IMPORT)) {
      const marker = 'import android.app.Application';
      src = src.includes(marker) ? src.replace(marker, marker + '\n' + IMPORT) : IMPORT + '\n' + src;
    }
    if (!src.includes('MetraMissionToolsPackage()')) {
      if (src.includes(KOTLIN_TOKEN)) {
        src = src.replace(KOTLIN_TOKEN, KOTLIN_WRAPPED);
      } else {
        const javaToken = 'new PackageList(this).getPackages()';
        if (src.includes(javaToken)) {
          src = src.replace(javaToken, 'new PackageList(this).getPackages() {{ add(new MetraMissionToolsPackage()); }}');
        } else {
          throw new Error('withMetraMissionTools: impossible de localiser PackageList dans MainApplication');
        }
      }
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MLKIT_DEP)) {
      const marker = 'dependencies {';
      if (!cfg.modResults.contents.includes(marker)) {
        throw new Error('withMetraMissionTools: bloc dependencies introuvable');
      }
      cfg.modResults.contents = cfg.modResults.contents.replace(marker, marker + '\n    ' + MLKIT_DEP);
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    const name = 'android.permission.RECORD_AUDIO';
    const hasPermission = manifest['uses-permission'].some((entry) => entry?.$?.['android:name'] === name);
    if (!hasPermission) manifest['uses-permission'].push({ $: { 'android:name': name } });
    return cfg;
  });

  return config;
};
