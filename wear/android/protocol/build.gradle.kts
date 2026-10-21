plugins { id("com.android.library"); id("org.jetbrains.kotlin.android") }
android {
  namespace = "com.anyvo.wear.protocol"
  compileSdk = 36
  defaultConfig { minSdk = 30 }
  sourceSets["main"].java.srcDir("../../../modules/anyvo-wearable-control/android/src/main/java/expo/modules/anyvowearablecontrol/protocol")
  sourceSets["main"].java.srcDir("../../../modules/anyvo-wearable-control/android/src/main/java/expo/modules/anyvowearablecontrol/transport")
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
}
dependencies {
  implementation("com.google.android.gms:play-services-wearable:20.0.1")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.json:json:20240303")
}
