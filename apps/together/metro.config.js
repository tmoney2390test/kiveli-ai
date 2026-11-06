const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// A second safe compression pass trims shared startup code without changing
// module loading, property names, or Expo's existing minifier safeguards.
config.transformer.minifierConfig.compress = {
  ...config.transformer.minifierConfig.compress,
  passes: 2,
};
module.exports = config;
