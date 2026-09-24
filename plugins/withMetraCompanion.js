const { withDangerousMod, withMainApplication, withAppBuildGradle, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const IMPORT = 'import com.metra.companion.MetraCompanionPackage';
const KOTLIN_TOKEN = 'PackageList(this).packages';
const KOTLIN_WRAPPED = 'PackageList(this).packages.apply { add(MetraCompanionPackage()) }';
const ZXING_DEP = "implementation 'com.google.zxing:core:3.5.3'";
const CODE_SCANNER_DEP = "implementation 'com.google.android.gms:play-services-code-scanner:16.1.0'";

module.exports = function withMetraCompanion(config) {
  config = withDangerousMod(config, ['android', async (cfg) => {
    const sourceDir = path.join(cfg.modRequest.projectRoot, 'native', 'metra-companion');
    const targetDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', 'com', 'metra', 'companion');
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of ['MetraCompanionModule.kt', 'MetraCompanionPackage.kt']) {
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
    if (!src.includes('MetraCompanionPackage()')) {
      if (src.includes(KOTLIN_TOKEN)) {
        src = src.replace(KOTLIN_TOKEN, KOTLIN_WRAPPED);
      } else {
        const javaToken = 'new PackageList(this).getPackages()';
        if (src.includes(javaToken)) {
          src = src.replace(javaToken, 'new PackageList(this).getPackages() {{ add(new MetraCompanionPackage()); }}');
        } else {
          throw new Error('withMetraCompanion: impossible de localiser PackageList dans MainApplication');
        }
      }
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    const marker = 'dependencies {';
    if (!cfg.modResults.contents.includes(marker)) throw new Error('withMetraCompanion: bloc dependencies introuvable');
    for (const dep of [ZXING_DEP, CODE_SCANNER_DEP]) {
      if (!cfg.modResults.contents.includes(dep)) cfg.modResults.contents = cfg.modResults.contents.replace(marker, marker + '\n    ' + dep);
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE']) {
      if (!manifest['uses-permission'].some((entry) => entry?.$?.['android:name'] === name)) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }
    return cfg;
  });

  return config;
};
