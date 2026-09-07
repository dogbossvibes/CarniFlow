Pod::Spec.new do |s|
  s.name           = 'AnyvoMotion'
  s.version        = '0.1.0'
  s.summary        = 'ANYVO Core Motion sensor fusion support (Phase 1: aggregated device motion + step/activity)'
  s.description    = 'Lokales Expo-Modul: aggregierte Core-Motion-Daten (Beschleunigung, Rotation, Schritte, Bewegungszustand) als Plausibilisierungs-Zusatzsignal zur GPS-Fährtenaufzeichnung. Ersetzt GPS nicht.'
  s.author         = 'ANYVO'
  s.homepage       = 'https://docs.expo.dev/modules/'
  # 15.1 statt 16.4: entspricht dem tatsächlichen App-Minimum aus ios/Podfile
  # (platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1' —
  # app.json hat KEIN expo-build-properties.ios.deploymentTarget). Ein
  # Pod-Minimum ÜBER dem App-Target wird von Expos Autolinking beim
  # `pod install` STILL (nur mit --verbose sichtbar: "doesn't support iOS
  # platform") aus dem Pods-Projekt ausgeschlossen — kein Build-Fehler, das
  # Modul linkt einfach nie. Genau das wurde bei der nativen Build-Verifikation
  # dieses Auftrags für AnyvoPrecisionLocation UND expo-speech-recognition
  # entdeckt (beide deklarieren 16.4, das App-Target bleibt aber 15.1) — siehe
  # Abschlussbericht. CMMotionManager/CMPedometer/CMMotionActivityManager
  # benötigen keine iOS-Version über 15.1, daher hier bewusst NICHT das
  # 16.4-Präzedens von AnyvoPrecisionLocation kopiert.
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreMotion'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
