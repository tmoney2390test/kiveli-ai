const key='kivelle:pending-birthdate';
const format=/^\d{4}-\d{2}-\d{2}$/;

export function birthdateDate(value:string):Date|null{
  if(!format.test(value))return null;
  const parts=value.split('-').map(Number);
  const year=parts[0]!;
  const month=parts[1]!;
  const day=parts[2]!;
  const date=new Date(year,month-1,day,12);
  return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
}

export function latestAdultBirthdate(now=new Date()):string{
  const date=new Date(now.getFullYear()-18,now.getMonth(),now.getDate(),12);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function earliestAdultBirthdate(now=new Date()):string{
  const date=new Date(now.getFullYear()-120,now.getMonth(),now.getDate(),12);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function formatBirthdateLabel(value:string):string{
  const date=birthdateDate(value);
  return date?date.toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}):value;
}

export function validBirthdateEntry(value:string):boolean{return birthdateDate(value)!==null;}

export function rememberPendingBirthdate(value:string):void{
  if(typeof window==='undefined'||!validBirthdateEntry(value))return;
  try{window.sessionStorage.setItem(key,value);}catch{/* Account setup still has the authenticated fallback page. */}
}

export function consumePendingBirthdate():string|null{
  if(typeof window==='undefined')return null;
  try{const value=window.sessionStorage.getItem(key);window.sessionStorage.removeItem(key);return value&&validBirthdateEntry(value)?value:null;}catch{return null;}
}
