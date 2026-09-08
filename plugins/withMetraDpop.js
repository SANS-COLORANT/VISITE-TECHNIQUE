const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const IMPORT = 'import com.metra.dpop.MetraDpopPackage';
const PACKAGE = 'packages.add(MetraDpopPackage())';

module.exports = function withMetraDpop(config) {
  config = withDangerousMod(config, ['android', async (cfg) => {
    const sourceDir = path.join(cfg.modRequest.projectRoot, 'native', 'metra-dpop');
    const targetDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', 'com', 'metra', 'dpop');
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of ['MetraDpopModule.kt', 'MetraDpopPackage.kt']) fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
    return cfg;
  }]);
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes(IMPORT)) {
      const marker = 'import android.app.Application';
      src = src.includes(marker) ? src.replace(marker, `${marker}\n${IMPORT}`) : `${IMPORT}\n${src}`;
    }
    if (!src.includes(PACKAGE)) {
      const kotlinPattern = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (kotlinPattern.test(src)) src = src.replace(kotlinPattern, (m) => `${m}\n              ${PACKAGE}`);
      else throw new Error('withMetraDpop: impossible de localiser getPackages() dans MainApplication');
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
