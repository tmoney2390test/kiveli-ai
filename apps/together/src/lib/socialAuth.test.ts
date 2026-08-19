import { describe, expect, it } from 'vitest';
import { parseOAuthCallbackUrl, resolveSocialAuthCapabilities, socialAuthErrorMessage } from './socialAuth';

describe('social authentication foundation',()=>{
  it('keeps providers fail-closed until explicitly enabled',()=>{
    expect(resolveSocialAuthCapabilities({})).toEqual({google:false,apple:false});
    expect(resolveSocialAuthCapabilities({google:'true',apple:'TRUE'})).toEqual({google:true,apple:true});
  });

  it('parses PKCE callbacks without trusting unrelated URL state',()=>{
    expect(parseOAuthCallbackUrl('together://auth/callback?code=abc123')).toEqual({code:'abc123'});
    expect(parseOAuthCallbackUrl('together://auth/callback?error_description=Access%20denied')).toEqual({error:'Access denied'});
  });

  it('presents missing provider configuration clearly',()=>{
    expect(socialAuthErrorMessage('google',new Error('Unsupported provider: provider is not enabled'))).toBe('Google sign-in is not configured yet.');
  });
});
