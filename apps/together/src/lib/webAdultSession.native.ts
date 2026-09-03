export type WebAdultSessionStatus={prepared:boolean;authorized:boolean;adultEligible?:boolean;premiumAccess?:boolean;available?:boolean};
export function ensureWebAdultSession(accessToken:string,options:{force?:boolean}={}):Promise<WebAdultSessionStatus>{void accessToken;void options;return Promise.resolve({prepared:false,authorized:false});}
