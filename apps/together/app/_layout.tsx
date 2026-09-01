import { DarkTheme, router, Slot, Stack, ThemeProvider } from 'expo-router';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import { colors } from '../src/theme';
import { createKivelliNavigationTheme } from '../src/lib/navigationTheme';
import { RouteTransitionVeil } from '../src/components/RouteTransitionVeil';
import { installWebNavigationCompatibility } from '../src/lib/appNavigation';

const navigationTheme=createKivelliNavigationTheme(DarkTheme);
installWebNavigationCompatibility(router);

export default function RootLayout(){return <ThemeProvider value={navigationTheme}><AppProviders><StatusBar style="light"/>{Platform.OS==='web'?<Slot/>:<Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background},animation:'fade'}}/>}<RouteTransitionVeil/></AppProviders></ThemeProvider>;}
