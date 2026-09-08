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
    for (const file of ['MetraDpopModule.kt', 'MetraDpopPackage.kt']) {
      fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
    }
    return cfg;
  }]);

  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;

    if (!src.includes(IMPORT)) {
      const marker = 'import android.app.Application';
      src = src.includes(marker)
        ? src.replace(marker, `${marker}\n${IMPORT}`)
        : `${IMPORT}\n${src}`;
    }

    if (!src.includes(PACKAGE)) {
      const expo51Block = /(val\s+packages\s*=\s*PackageList\(this\)\.packages\s*\n)/;
      const expressionApply = /(PackageList\(this\)\.packages\.apply\s*\{\s*\n?)/;
      const expressionAlso = /(PackageList\(this\)\.packages\.also\s*\{\s*packages\s*->\s*\n?)/;
      const javaBlock = /(List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\);\s*\n)/;

      if (expo51Block.test(src)) {
        src = src.replace(expo51Block, (m) => `${m}        ${PACKAGE}\n`);
      } else if (expressionApply.test(src)) {
        src = src.replace(expressionApply, (m) => `${m}              ${PACKAGE}\n`);
      } else if (expressionAlso.test(src)) {
        src = src.replace(expressionAlso, (m) => `${m}              ${PACKAGE}\n`);
      } else if (javaBlock.test(src)) {
        src = src.replace(javaBlock, (m) => `${m}      packages.add(new MetraDpopPackage());\n`);
      } else {
        throw new Error('withMetraDpop: impossible de localiser la liste ReactPackage dans MainApplication');
      }
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
