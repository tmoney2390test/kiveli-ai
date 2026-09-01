export type SocialAuthProvider='google'|'apple';
export type SocialAuthCapabilities={google:boolean;apple:boolean};
export type AppleFullName={givenName?:string|null;middleName?:string|null;familyName?:string|null};

export function resolveSocialAuthCapabilities(input:{google?:string;apple?:string}):SocialAuthCapabilities{
  return{google:input.google?.toLowerCase()==='true',apple:input.apple?.toLowerCase()==='true'};
}

export function parseOAuthCallbackUrl(value:string):{code?:string;error?:string}{
  try{const url=new URL(value),fragment=new URLSearchParams(url.hash.replace(/^#/,'')),code=url.searchParams.get('code')??fragment.get('code')??undefined,error=url.searchParams.get('error_description')??url.searchParams.get('error')??fragment.get('error_description')??fragment.get('error')??undefined;return{...(code?{code}:{}),...(error?{error}: {})};}
  catch{return{error:'The sign-in callback was invalid.'};}
}

export function socialAuthErrorMessage(provider:SocialAuthProvider,error:unknown):string{
  const code=typeof error==='object'&&error&&'code'in error?String((error as{code?:unknown}).code??''):'';
  const raw=error instanceof Error?error.message:String(error??'');
  if(/provider.*not.*enabled|unsupported provider/i.test(raw))return`${provider==='google'?'Google':'Apple'} sign-in is not configured yet.`;
  if(code==='ERR_REQUEST_CANCELED'||/cancel|dismiss|denied/i.test(raw))return'Sign-in was cancelled.';
  return raw||`${provider==='google'?'Google':'Apple'} sign-in could not be completed.`;
}

/** Apple provides a name only on the first native authorization. */
export function appleUserMetadata(fullName:AppleFullName|null|undefined,formattedName?:string|null):Record<string,string>|null{
  if(!fullName)return null;
  const givenName=fullName.givenName?.trim()??'',middleName=fullName.middleName?.trim()??'',familyName=fullName.familyName?.trim()??'';
  const displayName=(formattedName?.trim()||[givenName,middleName,familyName].filter(Boolean).join(' ')).slice(0,120);
  if(!displayName)return null;
  return{
    display_name:displayName,
    full_name:displayName,
    name:displayName,
    ...(givenName?{given_name:givenName.slice(0,80)}:{}),
    ...(familyName?{family_name:familyName.slice(0,80)}:{}),
    signup_app:'together',
  };
}
