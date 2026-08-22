import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // Keep identifiers stable so existing installations and service configuration continue to work.
  name: 'Kivelle.AI', slug: 'together', scheme: 'together', version: '1.0.0', orientation: 'portrait', userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  ios: { supportsTablet: true, bundleIdentifier: 'com.together.world', usesAppleSignIn:true, infoPlist: { NSPhotoLibraryUsageDescription: 'Choose a profile photo for your Kivelle profile.',NSMicrophoneUsageDescription:'Use your microphone for private live calls with your Kivelle companion.' } },
  android: { package: 'com.together.world', adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#080B13' }, permissions: ['POST_NOTIFICATIONS','RECORD_AUDIO','MODIFY_AUDIO_SETTINGS'] },
  web: { bundler: 'metro', output: 'static', favicon: './assets/icon.png' },
  plugins: ['expo-router','expo-secure-store','expo-system-ui','expo-notifications','expo-audio','@edkimmel/expo-audio-stream','expo-apple-authentication',['expo-image-picker',{photosPermission:'Choose a photo to share privately in Kivelle Chat.',cameraPermission:'Take a photo to share privately in Kivelle Chat.'}],['expo-splash-screen',{image:'./assets/icon.png',imageWidth:180,resizeMode:'contain',backgroundColor:'#080B13'}]],
  experiments: { typedRoutes: true },
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_TOGETHER_EAS_PROJECT_ID ?? 'ffa20139-6b44-425f-9370-ea451e1061ba',
    },
  },
});
