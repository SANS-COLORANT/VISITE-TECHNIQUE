module.exports = ({ config }) => {
  const key = String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const android = config.android || {};
  const androidConfig = android.config || {};

  return {
    ...config,
    android: {
      ...android,
      config: key
        ? { ...androidConfig, googleMaps: { ...(androidConfig.googleMaps || {}), apiKey: key } }
        : androidConfig,
    },
    extra: {
      ...(config.extra || {}),
      googleMapsConfigured: Boolean(key),
    },
  };
};
