Pod::Spec.new do |s|
  s.name           = 'AnyvoPrecisionLocation'
  s.version        = '0.1.0'
  s.summary        = 'ANYVO Precision Location (Phase 1: high-accuracy Core Location)'
  s.description    = 'Lokales Expo-Modul für High-Accuracy-Location der ANYVO-Fährtenaufzeichnung.'
  s.author         = 'ANYVO'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
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
