plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
  namespace = "com.anyvo.wear"
  compileSdk = 36
  defaultConfig {
    applicationId = "com.anyvo.app"
    minSdk = 30
    targetSdk = 36
    // 01 assigns the production form-factor versionCode and signing; no release defaults.
    versionCode = providers.gradleProperty("wearVersionCode").orNull?.toInt() ?: 1
    versionName = "1.0.5"
  }
  buildTypes {
    debug { applicationIdSuffix = ".watchtest" }
    release { isMinifyEnabled = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") }
  }
  buildFeatures { compose = true }
  sourceSets["main"].res.srcDir(layout.buildDirectory.dir("generated/anyvoBrand"))
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
}
val brandResources by tasks.registering(Copy::class) {
  from("../../../assets/images/icon.png") { rename { "anyvo_icon.png" } }
  into(layout.buildDirectory.dir("generated/anyvoBrand/drawable-nodpi"))
}
tasks.named("preBuild").configure { dependsOn(brandResources) }
// Never emit an accidentally unsigned/default-numbered production artifact.
tasks.configureEach {
  if (name == "preReleaseBuild") doFirst {
    check(providers.gradleProperty("wearVersionCode").isPresent) { "Release owner must assign a unique Wear versionCode." }
  }
}
dependencies {
  implementation(project(":protocol"))
  implementation("androidx.activity:activity-compose:1.10.0")
  implementation("androidx.wear.compose:compose-material3:1.5.0")
  implementation("androidx.wear.compose:compose-foundation:1.5.0")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
