const key='kivelle:pending-birthdate';
const format=/^\d{4}-\d{2}-\d{2}$/;

export function validBirthdateEntry(value:string):boolean{return format.test(value);}

export function rememberPendingBirthdate(value:string):void{
  if(typeof window==='undefined'||!validBirthdateEntry(value))return;
  try{window.sessionStorage.setItem(key,value);}catch{/* Account setup still has the authenticated fallback page. */}
}

export function consumePendingBirthdate():string|null{
  if(typeof window==='undefined')return null;
  try{const value=window.sessionStorage.getItem(key);window.sessionStorage.removeItem(key);return value&&validBirthdateEntry(value)?value:null;}catch{return null;}
}
