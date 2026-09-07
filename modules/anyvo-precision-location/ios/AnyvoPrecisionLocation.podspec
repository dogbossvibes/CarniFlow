Pod::Spec.new do |s|
  s.name           = 'AnyvoPrecisionLocation'
  s.version        = '0.1.0'
  s.summary        = 'ANYVO Precision Location (Phase 1: high-accuracy Core Location)'
  s.description    = 'Lokales Expo-Modul für High-Accuracy-Location der ANYVO-Fährtenaufzeichnung.'
  s.author         = 'ANYVO'
  s.homepage       = 'https://docs.expo.dev/modules/'
  # 15.1 statt 16.4: entspricht dem tatsächlichen App-Minimum aus ios/Podfile
  # (platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1' —
  # app.json hat KEIN expo-build-properties.ios.deploymentTarget). Ein
  # Pod-Minimum ÜBER dem App-Target wird von Expos Autolinking beim
  # `pod install` STILL (nur mit --verbose sichtbar: "doesn't support iOS
  # platform") aus dem Pods-Projekt ausgeschlossen — kein Build-Fehler, das
  # Modul linkt einfach nie (Diagnose vom fix/ios-native-autolinking-targets-
  # Auftrag, verifiziert per `pod install --verbose`). Alle in diesem Modul
  # tatsächlich verwendeten CoreLocation-APIs sind bereits korrekt mit
  # `#available`-Guards auf maximal iOS 15.0 abgesichert (siehe
  # AnyvoPrecisionLocationManager.swift: requestTemporaryFullAccuracyAuthorization/
  # accuracyAuthorization ab iOS 14, sourceInformation?.isSimulatedBySoftware ab
  # iOS 15) — nichts im Code benötigt iOS 16. Auch die einzige Abhängigkeit
  # ExpoModulesCore deklariert selbst nur `:ios => '15.1'`. 16.4 war daher eine
  # unbegründete Vorgabe (dieses Modul war die Vorlage für AnyvoMotion, das
  # denselben unbegründeten Wert übernommen hatte — dort bereits auf 15.1
  # korrigiert, siehe Branch feat/core-motion-track-fusion).
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreLocation'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
