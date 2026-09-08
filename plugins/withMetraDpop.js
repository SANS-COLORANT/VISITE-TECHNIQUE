const { withMainApplication } = require('@expo/config-plugins');

const IMPORT = 'import com.metra.dpop.MetraDpopPackage';
const PACKAGE = 'packages.add(MetraDpopPackage())';

module.exports = function withMetraDpop(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes(IMPORT)) {
      const marker = 'import android.app.Application';
      src = src.includes(marker) ? src.replace(marker, `${marker}\n${IMPORT}`) : `${IMPORT}\n${src}`;
    }
    if (!src.includes(PACKAGE)) {
      const kotlinPattern = /PackageList\(this\)\.packages\.apply\s*\{/;
      const javaPattern = /List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);/;
      if (kotlinPattern.test(src)) src = src.replace(kotlinPattern, (m) => `${m}\n              ${PACKAGE}`);
      else if (javaPattern.test(src)) src = src.replace(javaPattern, (m) => `${m}\n      packages.add(new MetraDpopPackage());`);
      else throw new Error('withMetraDpop: impossible de localiser getPackages() dans MainApplication');
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
