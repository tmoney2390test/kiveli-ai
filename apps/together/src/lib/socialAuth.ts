export type SocialAuthProvider='google'|'apple';
export type SocialAuthCapabilities={google:boolean;apple:boolean};

export function resolveSocialAuthCapabilities(input:{google?:string;apple?:string}):SocialAuthCapabilities{
  return{google:input.google?.toLowerCase()==='true',apple:input.apple?.toLowerCase()==='true'};
}

export function parseOAuthCallbackUrl(value:string):{code?:string;error?:string}{
  try{const url=new URL(value),fragment=new URLSearchParams(url.hash.replace(/^#/,'')),code=url.searchParams.get('code')??fragment.get('code')??undefined,error=url.searchParams.get('error_description')??url.searchParams.get('error')??fragment.get('error_description')??fragment.get('error')??undefined;return{...(code?{code}:{}),...(error?{error}: {})};}
  catch{return{error:'The sign-in callback was invalid.'};}
}

export function socialAuthErrorMessage(provider:SocialAuthProvider,error:unknown):string{
  const raw=error instanceof Error?error.message:String(error??'');
  if(/provider.*not.*enabled|unsupported provider/i.test(raw))return`${provider==='google'?'Google':'Apple'} sign-in is not configured yet.`;
  if(/cancel|dismiss|denied/i.test(raw))return'Sign-in was cancelled.';
  return raw||`${provider==='google'?'Google':'Apple'} sign-in could not be completed.`;
}
