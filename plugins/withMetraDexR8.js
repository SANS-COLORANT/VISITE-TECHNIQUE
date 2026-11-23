/**
 * Pilot R8 optimization for Android Play builds (METRA_EXPERIMENTAL_R8=1).
 *
 * Keep the rollout opt-in. Production and other branches remain unchanged.
 * The first experiment optimizes Java/Kotlin/Dex only; shrinking resources
 * stays disabled until native flows and imagery have been validated.
 */
const { withGradleProperties } = require('@expo/config-plugins');

function setGradleProperty(items, key, value) {
  const result = (items || []).filter((item) => !(item.type === 'property' && item.key === key));
  result.push({ type: 'property', key, value: String(value) });
  return result;
}

module.exports = function withMetraDexR8(config) {
  if (process.env.METRA_EXPERIMENTAL_R8 !== '1') return config;
  return withGradleProperties(config, (mod) => {
    let items = mod.modResults;
    items = setGradleProperty(items, 'android.enableMinifyInReleaseBuilds', 'true');
    items = setGradleProperty(items, 'android.enableShrinkResourcesInReleaseBuilds', 'false');
    mod.modResults = items;
    return mod;
  });
};
