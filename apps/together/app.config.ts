import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // Keep the legacy scheme during the pre-release identifier transition so
  // existing development builds can still finish an in-flight auth callback.
  name: 'Kivelle.AI', slug: 'together', scheme: ['kivelli','together'], version: '1.0.0', orientation: 'default', userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  ios: { supportsTablet: true, bundleIdentifier: 'app.kivelli', usesAppleSignIn:true, infoPlist: { CFBundleAllowMixedLocalizations:true,ITSAppUsesNonExemptEncryption:false,NSPhotoLibraryUsageDescription: 'Choose a photo to share privately in Kivelle Chat.',NSMicrophoneUsageDescription:'Use your microphone for private voice-to-text and live calls with your Kivelle companion.',UIBackgroundModes:['audio'] } },
  android: { package: 'app.kivelli', adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#080B13' }, permissions: ['POST_NOTIFICATIONS','RECORD_AUDIO','MODIFY_AUDIO_SETTINGS'] },
  web: { bundler: 'metro', output: 'static', favicon: './assets/kivelle-icon-transparent.png' },
  plugins: [[
    'expo-router',
    {
      origin: 'https://kivelli.app',
      asyncRoutes: { web: true, default: 'development' },
    },
  ],'expo-secure-store','expo-system-ui','expo-notifications','expo-audio','expo-image','expo-video','@edkimmel/expo-audio-stream','expo-apple-authentication',['expo-image-picker',{photosPermission:'Choose a photo to share privately in Kivelle Chat.',cameraPermission:'Take a photo to share privately in Kivelle Chat.'}],['expo-splash-screen',{image:'./assets/icon.png',imageWidth:180,resizeMode:'contain',backgroundColor:'#080B13'}]],
  experiments: { typedRoutes: true },
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_TOGETHER_EAS_PROJECT_ID ?? 'ffa20139-6b44-425f-9370-ea451e1061ba',
    },
  },
});
