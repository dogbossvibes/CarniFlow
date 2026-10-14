Pod::Spec.new do |s|
  s.name = 'AnyvoDailyWidget'
  s.version = '0.1.0'
  s.summary = 'ANYVO local account-bound daily widget snapshots'
  s.description = 'Local Expo bridge to WidgetKit. No native network, credentials, GPS or customer writes.'
  s.author = 'ANYVO'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '15.1' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WidgetKit', 'CryptoKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{swift,h,m,mm}'
end
