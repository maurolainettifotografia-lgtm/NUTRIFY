const { withAndroidManifest } = require('@expo/config-plugins');
module.exports = function withLocalApi(config) {
  return withAndroidManifest(config, (mod) => {
    const localHttp = (process.env.EXPO_PUBLIC_BACKEND_URL || '').startsWith('http://');
    mod.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = String(localHttp);
    return mod;
  });
};
