import{describe,expect,it,vi}from'vitest';
import{consumePendingBirthdate,rememberPendingBirthdate,validBirthdateEntry}from'./pendingBirthdate';

describe('pending account birthdate',()=>{
  it('accepts only the account form shape',()=>{expect(validBirthdateEntry('1990-01-15')).toBe(true);expect(validBirthdateEntry('01/15/1990')).toBe(false);});
  it('keeps the value only for the OAuth redirect tab and consumes it once',()=>{const store=new Map<string,string>();vi.stubGlobal('window',{sessionStorage:{setItem:(key:string,value:string)=>store.set(key,value),getItem:(key:string)=>store.get(key)??null,removeItem:(key:string)=>store.delete(key)}});rememberPendingBirthdate('1990-01-15');expect(consumePendingBirthdate()).toBe('1990-01-15');expect(consumePendingBirthdate()).toBeNull();vi.unstubAllGlobals();});
});
