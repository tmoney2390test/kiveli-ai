import { describe, expect, it } from 'vitest';
import { appleUserMetadata, parseOAuthCallbackUrl, resolveSocialAuthCapabilities, socialAuthErrorMessage, socialOAuthCallbackPath } from './socialAuth';

describe('social authentication foundation',()=>{
  it('uses the exact allowlisted callback for native OAuth even with a return destination',()=>{
    expect(socialOAuthCallbackPath('ios','/chat?conversation=123')).toBe('/auth/callback');
    expect(socialOAuthCallbackPath('android','/chat?conversation=123')).toBe('/auth/callback');
    expect(socialOAuthCallbackPath('web','/chat?conversation=123')).toBe('/auth/callback?next=%2Fchat%3Fconversation%3D123');
  });
  it('keeps providers fail-closed until explicitly enabled',()=>{
    expect(resolveSocialAuthCapabilities({})).toEqual({google:false,apple:false});
    expect(resolveSocialAuthCapabilities({google:'true',apple:'TRUE'})).toEqual({google:true,apple:true});
  });

  it('parses PKCE callbacks without trusting unrelated URL state',()=>{
    expect(parseOAuthCallbackUrl('kivelli://auth/callback?code=abc123')).toEqual({code:'abc123'});
    expect(parseOAuthCallbackUrl('kivelli://auth/callback?error_description=Access%20denied')).toEqual({error:'Access denied'});
    expect(parseOAuthCallbackUrl('together://auth/callback?code=legacy')).toEqual({code:'legacy'});
    expect(parseOAuthCallbackUrl('not a callback')).toEqual({error:'The sign-in callback was invalid.'});
  });

  it('presents missing provider configuration clearly',()=>{
    expect(socialAuthErrorMessage('google',new Error('Unsupported provider: provider is not enabled'))).toBe('Google sign-in is not configured yet.');
  });

  it('normalizes native Apple cancellation without exposing provider details',()=>{
    expect(socialAuthErrorMessage('apple',{code:'ERR_REQUEST_CANCELED'})).toBe('Sign-in was cancelled.');
  });

  it('preserves the one-time Apple name in standard Supabase metadata fields',()=>{
    expect(appleUserMetadata({givenName:' Akari ',middleName:null,familyName:' Vale '},'Vale, Akari')).toEqual({
      display_name:'Vale, Akari',
      full_name:'Vale, Akari',
      name:'Vale, Akari',
      given_name:'Akari',
      family_name:'Vale',
      signup_app:'together',
    });
    expect(appleUserMetadata({givenName:null,familyName:null})).toBeNull();
  });
});
