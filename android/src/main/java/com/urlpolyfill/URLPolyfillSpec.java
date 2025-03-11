package com.urlpolyfill;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;

public abstract class URLPolyfillSpec extends ReactContextBaseJavaModule {
    URLPolyfillSpec(ReactApplicationContext context) {
        super(context);
    }
}

// 10. Update android/build.gradle
buildscript {
    ext.safeExtGet = { prop, fallback ->
        rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback
    }
    repositories {
        google()
        mavenCentral()
    }
}

android {
    compileSdkVersion safeExtGet('compileSdkVersion', 31)
    buildToolsVersion safeExtGet('buildToolsVersion', '31.0.0')

    defaultConfig {
        minSdkVersion safeExtGet('minSdkVersion', 21)
        targetSdkVersion safeExtGet('targetSdkVersion', 31)
    }

    sourceSets {
        main {
            if (project.hasProperty('newArchEnabled') && project.newArchEnabled == "true") {
                java.srcDirs += ['src/newarch/java']
            } else {
                java.srcDirs += ['src/oldarch/java']
            }
        }
    }

    buildFeatures {
        buildConfig true
    }
}

dependencies {
    implementation "com.facebook.react:react-native:+"

    if (project.hasProperty('newArchEnabled') && project.newArchEnabled == "true") {
        implementation "com.facebook.react:react-android-turbomodule-annotations:+"
    }
}