plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
  namespace = "com.anyvo.wear.transporttest"
  compileSdk = 36
  defaultConfig { applicationId = "com.anyvo.app.watchtest"; minSdk = 30; targetSdk = 36; versionCode = 1; versionName = "transport-test" }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
}
androidComponents { beforeVariants(selector().withBuildType("release")) { it.enable = false } }
dependencies { implementation(project(":protocol")); implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0") }
