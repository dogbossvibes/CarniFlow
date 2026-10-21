Pod::Spec.new do |s|
  s.name = 'AnyvoWearableControl'
  s.version = '0.1.0'
  s.summary = 'Companion watch commands for an explicitly prepared ANYVO phone session'
  s.description = 'WatchConnectivity transport only. The phone remains recorder and persistence owner.'
  s.author = 'ANYVO'
  s.homepage = 'https://developer.apple.com/documentation/watchconnectivity'
  s.platforms = { :ios => '15.1' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WatchConnectivity'
  s.swift_version = '5.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
