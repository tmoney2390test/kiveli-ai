import { Platform } from 'react-native';
import type { GlassView, GlassViewProps, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

type GlassModule = {
  GlassView: typeof GlassView;
  isGlassEffectAPIAvailable: typeof isGlassEffectAPIAvailable;
  isLiquidGlassAvailable: typeof isLiquidGlassAvailable;
};
let glassModule: GlassModule | null | undefined;

function loadGlassModule(): GlassModule | null {
  if (Platform.OS !== 'ios') return null;
  if (glassModule !== undefined) return glassModule;
  try {
    // A web update can reach an older native binary before it is rebuilt with
    // this module. Resolve it only on iOS, and keep the blur fallback safe.
    glassModule = require('expo-glass-effect') as GlassModule;
  } catch {
    glassModule = null;
  }
  return glassModule;
}

export function supportsIosLiquidGlass(): boolean {
  const glass = loadGlassModule();
  if (!glass) return false;
  try { return glass.isGlassEffectAPIAvailable() && glass.isLiquidGlassAvailable(); }
  catch { return false; }
}

export function IosLiquidGlass(props: GlassViewProps) {
  const GlassView = loadGlassModule()?.GlassView;
  return GlassView ? <GlassView {...props} /> : null;
}
