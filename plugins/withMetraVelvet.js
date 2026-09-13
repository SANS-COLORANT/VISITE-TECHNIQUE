const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function patchMainApplication(source, language = 'kt') {
  if (language !== 'kt') throw new Error('Velvet: this project requires the reviewed Kotlin MainApplication template');
  let result = source;
  const declaration = 'import com.metra.velvet.MetraVelvetPackage';
  const marker = 'import android.app.Application';
  if (!result.includes(declaration)) {
    if (!result.includes(marker)) throw new Error('Velvet: Android Application import missing');
    result = result.replace(marker, marker + '\n' + declaration);
  }
  if (!result.includes('add(MetraVelvetPackage())')) {
    const token = 'PackageList(this).packages';
    if (!result.includes(token)) throw new Error('Velvet: PackageList missing');
    result = result.replace(token, token + '.apply { add(MetraVelvetPackage()) }');
  }
  return result;
}

function withMetraVelvet(config) {
  config = withDangerousMod(config, ['android', async cfg => {
    const root = cfg.modRequest.projectRoot;
    const android = cfg.modRequest.platformProjectRoot;
    const java = path.join(android, 'app/src/main/java/com/metra/velvet');
    fs.mkdirSync(java, { recursive: true });
    for (const file of ['MetraVelvetView.kt', 'MetraVelvetManager.kt', 'MetraVelvetPackage.kt']) {
      fs.copyFileSync(path.join(root, 'native/metra-velvet', file), path.join(java, file));
    }
    // Source-only CI compiles the native bridge without producing or publishing an APK.
    if (process.env.METRA_VELVET_SOURCE_CHECK !== '1') {
      const source = path.join(root, 'visual-packs/spiral-active/startup-media');
      const meta = JSON.parse(fs.readFileSync(path.join(source, 'animation-provenance.json'), 'utf8'));
      const assets = path.join(android, 'app/src/main/assets/metra/velvet');
      fs.mkdirSync(assets, { recursive: true });
      for (const [file, expected] of [
        [meta.source, meta.sha256],
        ['spiral-dock.png', meta.dock.sha256],
        ['spiral-final-canvas.png', meta.finalCanvas.sha256],
      ]) {
        if (!file || path.basename(file) !== file) throw new Error('Velvet: unsafe asset name');
        const bytes = fs.readFileSync(path.join(source, file));
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Velvet: media fingerprint mismatch');
        fs.writeFileSync(path.join(assets, file), bytes);
      }
    }
    return cfg;
  }]);
  return withMainApplication(config, cfg => {
    cfg.modResults.contents = patchMainApplication(cfg.modResults.contents, cfg.modResults.language);
    return cfg;
  });
}
module.exports = withMetraVelvet;
module.exports.patchMainApplication = patchMainApplication;
