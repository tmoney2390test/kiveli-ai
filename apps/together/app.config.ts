import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // Keep identifiers stable so existing installations and service configuration continue to work.
  name: 'Kivelle.AI', slug: 'together', scheme: 'together', version: '1.0.0', orientation: 'portrait', userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  ios: { supportsTablet: true, bundleIdentifier: 'com.together.world', infoPlist: { NSPhotoLibraryUsageDescription: 'Choose a profile photo for your Kivelle profile.' } },
  android: { package: 'com.together.world', adaptiveIcon: { foregroundImage: './assets/icon.png', backgroundColor: '#080B13' }, permissions: ['POST_NOTIFICATIONS'] },
  web: { bundler: 'metro', output: 'static', favicon: './assets/icon.png' },
  plugins: ['expo-router','expo-secure-store','expo-system-ui','expo-notifications','expo-image-picker',['expo-splash-screen',{image:'./assets/icon.png',imageWidth:180,resizeMode:'contain',backgroundColor:'#080B13'}]],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env.EXPO_PUBLIC_TOGETHER_EAS_PROJECT_ID } },
});
