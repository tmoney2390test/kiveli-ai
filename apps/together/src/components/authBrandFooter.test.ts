/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const auth = readFileSync(new URL('../../app/auth.tsx', import.meta.url), 'utf8');

describe('authentication brand footer', () => {
  it('reuses one site logo below the form and legal links for both auth modes', () => {
    expect(auth).toContain("import { KivelleLogo } from '../src/components/KivelleLogo'");
    expect(auth.match(/<KivelleLogo\b/g)).toHaveLength(1);
    const footer = auth.indexOf('<View style={[styles.brandFooter');
    expect(footer).toBeGreaterThan(auth.indexOf('accessibilityLabel="Account agreement"'));
    expect(auth.slice(footer, auth.indexOf('</ScrollView>'))).not.toContain('creating');
  });

  it('keeps the logo outside the hero and in normal layout flow', () => {
    const hero = auth.slice(auth.indexOf('<View style={[styles.hero'), auth.indexOf('styles.formPanel,'));
    expect(hero).not.toContain('KivelleLogo');
    expect(auth).toContain("brandFooter:{flexShrink:0,alignItems:'center',marginTop:'auto',paddingTop:24}");
    expect(auth).toContain('paddingBottom:Math.max(insets.bottom+');
  });

  it('reserves logo and spacing height before sizing the mobile photo', () => {
    expect(auth).toContain('const brandFooterReserve=shortViewport?44:58;');
    expect(auth).toContain('+safeAreaReserve+brandFooterReserve;');
    expect(auth).toContain('<KivelleLogo height={shortViewport?28:wide?40:34}/>');
  });
});
