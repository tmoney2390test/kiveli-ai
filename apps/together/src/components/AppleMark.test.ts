/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-svg', () => ({ default: 'svg', Path: 'path' }));

import { AppleMark } from './AppleMark';

describe('Apple sign-in mark', () => {
  it('renders a font-independent, high-contrast vector at social-button size', () => {
    const mark = AppleMark({});
    expect(mark.type).toBe('svg');
    expect(mark.props).toMatchObject({ width: 18, height: 18, viewBox: '0 0 24 24' });
    expect(mark.props.children.type).toBe('path');
    expect(mark.props.children.props.fill).toBe('#FFFFFF');
    expect(mark.props.children.props.d).toContain('M12.152 6.896');
  });

  it('supports the existing theme and leaves the accessible label on the button', () => {
    const mark = AppleMark({ size: 22, color: '#EFEAF6' });
    expect(mark.props).toMatchObject({ width: 22, height: 22, 'aria-hidden': true, focusable: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
    expect(mark.props.children.props.fill).toBe('#EFEAF6');
  });

  it('uses the vector in the shared sign-in/signup screen and preserves the native iOS button', () => {
    const auth = readFileSync(new URL('../../app/auth.tsx', import.meta.url), 'utf8');
    expect(auth).toContain('<AppleMark color={colors.text}/>');
    expect(auth).not.toContain('\uF8FF');
    expect(auth).toContain('accessibilityLabel="Continue with Apple"');
    expect(auth).toContain('<AppleAuthentication.AppleAuthenticationButton');
  });
});
