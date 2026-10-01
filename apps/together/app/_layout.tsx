import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import { BrowserPageTitle } from '../src/components/BrowserPageTitle';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import { colors } from '../src/theme';
import { createKivelliNavigationTheme } from '../src/lib/navigationTheme';
import { RouteTransitionVeil } from '../src/components/RouteTransitionVeil';
import { installWebNavigationCompatibility } from '../src/lib/appNavigation';

const navigationTheme=createKivelliNavigationTheme(DarkTheme);
const instantSettingsScreens=new Set([
  'account','personas','persona-editor','content-settings',
  'notifications','photo-settings','media-preferences','conversation-controls',
  'archived-chats','privacy','help','support','support/new',
  'subscription','companions','memories','community-guidelines','privacy-policy',
  'terms','refund-policy',
]);
installWebNavigationCompatibility(router);

export default function RootLayout(){return <ThemeProvider value={navigationTheme}><BrowserPageTitle/><AppProviders><StatusBar style="light"/><Stack screenOptions={({route})=>({headerShown:false,contentStyle:{backgroundColor:colors.background},animation:instantSettingsScreens.has(route.name)?'none':'fade'})}/><RouteTransitionVeil/></AppProviders></ThemeProvider>;}
