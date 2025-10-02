# Keep the React Native core modules
-keep public class com.facebook.react.modules.** { *; }
-keep public class com.facebook.react.turbomodule.** { *; }

# Keep Hermes JS engine classes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.hermes.intl.** { *; }

# Keep generic native module definitions
-keep,includedescriptorclasses public class * extends com.facebook.react.bridge.BaseJavaModule {
    @com.facebook.react.bridge.ReactMethod
    public <methods>;
}
-keep,includedescriptorclasses public class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    @com.facebook.react.bridge.ReactMethod
    public <methods>;
}

# --- NEW AND CORRECTED RULES ---

# Keep react-native-sensors
-keep class com.sensors.** { *; }

# Keep react-native-geolocation-service
-keep class com.agontuk.RNFusedLocation.** { *; }

# Keep react-native-screens (This was likely a major cause of the crash)
-keep class com.swmansion.rnscreens.** { *; }

# Keep react-native-safe-area-context
-keep class com.th3rdwave.safeareacontext.** { *; }

# Keep OkHttp, the networking library used by React Native
-keep,allowobfuscation,allowshrinking class okhttp3.** { *; }
-keep,allowobfuscation,allowshrinking class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**