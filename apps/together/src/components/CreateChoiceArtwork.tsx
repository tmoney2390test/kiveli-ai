import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Quiet image placeholders for the two creation paths, drawn locally so they load instantly. */
export function CreateChoiceArtwork({ kind }: { kind: 'character' | 'place' }) {
  return <Svg width="100%" height="100%" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" accessible={false}>
    {kind === 'character' ? <>
      <Defs>
        <LinearGradient id="characterSky" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#392350"/><Stop offset=".55" stopColor="#251837"/><Stop offset="1" stopColor="#100C1C"/></LinearGradient>
        <RadialGradient id="characterGlow" cx="50%" cy="43%" rx="49%" ry="56%"><Stop offset="0" stopColor="#A87CD3" stopOpacity=".62"/><Stop offset=".56" stopColor="#775399" stopOpacity=".22"/><Stop offset="1" stopColor="#6F3F87" stopOpacity="0"/></RadialGradient>
      </Defs>
      <Rect width="400" height="250" fill="url(#characterSky)"/>
      <Rect width="400" height="250" fill="url(#characterGlow)"/>
      <Ellipse cx="200" cy="133" rx="102" ry="110" fill="none" stroke="#D4A6ED" strokeOpacity=".16" strokeWidth="1"/>
      <Circle cx="73" cy="58" r="1.6" fill="#F5D8FF" opacity=".5"/><Circle cx="313" cy="72" r="1.4" fill="#F5D8FF" opacity=".45"/><Circle cx="338" cy="146" r="1" fill="#F5D8FF" opacity=".4"/>
      <Path d="M94 250c8-42 35-65 70-76 15-5 25-15 25-29h22c0 14 10 24 25 29 36 12 63 34 70 76H94Z" fill="#100C1B"/>
      <Path d="M164 166c-17-11-27-28-27-56 0-45 24-72 63-72 40 0 64 27 64 72 0 28-10 45-27 56-5 4-11 7-18 9h-38c-7-2-13-5-17-9Z" fill="#130D20" stroke="#B68DCD" strokeOpacity=".18" strokeWidth="2"/>
      <Path d="M144 106c-6-43 12-74 48-80 37-7 68 13 74 54 3 19-1 34-8 45-1-31-12-55-35-61-18 12-39 17-68 18-7 10-10 24-11 40-5-6-7-11-9-16Z" fill="#0C0916"/>
      <Path d="M132 250c10-35 30-58 55-68 7 10 20 17 36 17 17 0 29-7 37-17 27 11 47 35 55 68H132Z" fill="#0D0917"/>
    </> : <>
      <Defs>
        <LinearGradient id="citySky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#43305E"/><Stop offset=".58" stopColor="#302341"/><Stop offset="1" stopColor="#17111F"/></LinearGradient>
        <RadialGradient id="cityGlow" cx="50%" cy="55%" rx="60%" ry="55%"><Stop offset="0" stopColor="#B683C5" stopOpacity=".42"/><Stop offset="1" stopColor="#705286" stopOpacity="0"/></RadialGradient>
      </Defs>
      <Rect width="400" height="250" fill="url(#citySky)"/><Rect width="400" height="250" fill="url(#cityGlow)"/>
      <Circle cx="315" cy="57" r="22" fill="#C9A6D4" opacity=".20"/>
      <Rect x="0" y="143" width="39" height="107" fill="#2A2035"/><Rect x="36" y="116" width="31" height="134" fill="#2A2035"/><Rect x="62" y="155" width="51" height="95" fill="#2A2035"/><Rect x="111" y="123" width="41" height="127" fill="#2A2035"/>
      <Rect x="151" y="146" width="50" height="104" fill="#2A2035"/><Rect x="205" y="109" width="45" height="141" fill="#2A2035"/><Rect x="251" y="136" width="45" height="114" fill="#2A2035"/><Rect x="295" y="123" width="38" height="127" fill="#2A2035"/><Rect x="331" y="151" width="69" height="99" fill="#2A2035"/>
      <Rect x="13" y="165" width="48" height="85" fill="#15111F"/><Rect x="58" y="130" width="49" height="120" fill="#17111F"/><Rect x="109" y="169" width="38" height="81" fill="#15111F"/>
      <Rect x="145" y="94" width="60" height="156" fill="#15111F"/><Rect x="153" y="87" width="44" height="7" fill="#15111F"/><Rect x="170" y="77" width="9" height="10" fill="#15111F"/>
      <Rect x="203" y="152" width="42" height="98" fill="#17111F"/><Rect x="247" y="72" width="57" height="178" fill="#14101C"/><Rect x="256" y="64" width="39" height="8" fill="#14101C"/>
      <Rect x="307" y="135" width="49" height="115" fill="#17111F"/><Rect x="352" y="163" width="48" height="87" fill="#15111F"/>
      <Path d="M0 231c76-7 149-3 211-9 68-7 135-6 189 2v26H0v-19Z" fill="#0F0C18"/>
      <Path d="M166 118h7m11 0h7m-25 17h7m11 0h7m-25 17h7m11 0h7m-25 17h7m11 0h7m66-66h7m12 0h7m-26 17h7m12 0h7m-26 17h7m12 0h7m-26 17h7m12 0h7" stroke="#C9A5D9" strokeOpacity=".38" strokeWidth="3"/>
      <Path d="M73 155h6m10 0h6m-22 15h6m10 0h6m119 6h6m10 0h6m92-17h6m10 0h6" stroke="#CF9ED0" strokeOpacity=".27" strokeWidth="3"/>
    </>}
  </Svg>;
}
