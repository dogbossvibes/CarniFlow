// Prebuild-Guard für expo-live-activity (siehe withAnyvoRestingLiveActivity.js).
// In app.json NACH "expo-live-activity" eintragen → läuft VOR dessen Xcode-Mod.
module.exports = require('./withAnyvoRestingLiveActivity').withAnyvoLiveActivityPrebuildGuard;
