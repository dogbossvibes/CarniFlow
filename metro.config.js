const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
// Release preparation on the shared host: keep OTA bundling to one worker.
config.maxWorkers = 1;

module.exports = withNativeWind(config, { input: './global.css' });
