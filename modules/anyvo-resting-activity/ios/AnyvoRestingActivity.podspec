Pod::Spec.new do |s|
  s.name           = 'AnyvoRestingActivity'
  s.version        = '0.1.0'
  s.summary        = 'ANYVO Liegezeit Live Activity V2 (ActivityKit, Multi-Dog)'
  s.description    = 'Lokales Expo-Modul: startet/beendet/listet Liegezeit-Live-Activities je dogId + sessionId. Reine Darstellung — keine Tracking-/Recovery-Logik.'
  s.author         = 'ANYVO'
  s.homepage       = 'https://docs.expo.dev/modules/'
  # 15.1 = tatsächliches App-Minimum (siehe AnyvoMotion.podspec): ein höheres Pod-Minimum
  # würde beim `pod install` STILL ausgeschlossen. ActivityKit ist erst ab iOS 16.2 nutzbar —
  # jeder Aufruf ist per `#available(iOS 16.2, *)` geschützt, das Framework schwach gelinkt.
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
