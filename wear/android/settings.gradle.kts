pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "AnyvoWear"
include(":app", ":protocol")
// Optional ABI check against a real SDK-54 Expo Core compile JAR; never packaged in the watch.
if (providers.gradleProperty("expoCoreCompileJar").isPresent) include(":bridge-check")
if (providers.gradleProperty("transportTest").orNull == "true") include(":companion-test")
