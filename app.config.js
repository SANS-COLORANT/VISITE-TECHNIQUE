const base = require('./app.json');

module.exports = () => {
  const key = String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const expo = base.expo || {};
  const android = expo.android || {};
  const config = android.config || {};

  return {
    ...base,
    expo: {
      ...expo,
      android: {
        ...android,
        config: key
          ? { ...config, googleMaps: { ...(config.googleMaps || {}), apiKey: key } }
          : config,
      },
      extra: {
        ...(expo.extra || {}),
        googleMapsConfigured: Boolean(key),
      },
    },
  };
};
