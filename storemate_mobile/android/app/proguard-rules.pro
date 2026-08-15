# ============ Google Sign-In ============
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep interface com.google.android.gms.auth.api.signin.** { *; }
-keep class com.google.android.gms.common.api.** { *; }
-dontwarn com.google.android.gms.**

# ============ WatermelonDB ============
-keep class com.nozbe.watermelondb.** { *; }
-dontwarn com.nozbe.watermelondb.**

# ============ React Native FS ============
-keep class com.rnfs.** { *; }

# ============ React Native Share ============
-keep class cl.json.** { *; }
-keep class cl.json.social.** { *; }

# ============ React Native Camera Kit ============
-keep class com.rncamerakit.** { *; }

# ============ AsyncStorage / Encrypted Storage ============
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.reactnativeencryptedstorage.** { *; }

# ============ JailMonkey ============
-keep class com.gantix.JailMonkey.** { *; }

# ============ SQLCipher (used by WatermelonDB) ============
-keep class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.* { *; }
-dontwarn net.sqlcipher.**

# ============ General React Native safety net ============
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}