import Svg, { Path } from 'react-native-svg';

export function GoogleMark({ size = 18 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 18 18" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.615Z" />
    <Path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.329-1.585-5.037-3.711H.957v2.333A9 9 0 0 0 9 18Z" />
    <Path fill="#FBBC05" d="M3.963 10.71A5.42 5.42 0 0 1 3.68 9c0-.594.103-1.17.283-1.71V4.957H.957A9 9 0 0 0 0 9c0 1.453.348 2.827.957 4.043l3.006-2.333Z" />
    <Path fill="#EA4335" d="M9 3.579c1.321 0 2.508.454 3.442 1.346l2.581-2.582C13.464.892 11.426 0 9 0A9 9 0 0 0 .957 4.957L3.963 7.29C4.671 5.164 6.656 3.579 9 3.579Z" />
  </Svg>;
}
