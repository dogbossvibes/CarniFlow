plugins { id("com.android.library"); id("org.jetbrains.kotlin.android") }
android {
  namespace = "com.anyvo.wear.bridgecheck"
  compileSdk = 36
  defaultConfig { minSdk = 24 }
  sourceSets["main"].java.srcDir("../../../modules/anyvo-wearable-control/android/src/main/java")
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
}
dependencies {
  compileOnly(files(providers.gradleProperty("expoCoreCompileJar").get()))
  compileOnly("com.facebook.react:react-android:0.81.5")
  implementation("com.google.android.gms:play-services-wearable:20.0.1")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
