import{describe,expect,it,vi}from'vitest';
import{consumePendingBirthdate,latestAdultBirthdate,rememberPendingBirthdate,validBirthdateEntry}from'./pendingBirthdate';

describe('pending account birthdate',()=>{
  it('accepts only real calendar dates in the account form shape',()=>{expect(validBirthdateEntry('1990-01-15')).toBe(true);expect(validBirthdateEntry('2000-02-30')).toBe(false);expect(validBirthdateEntry('01/15/1990')).toBe(false);});
  it('caps the picker at the latest date that is at least 18 years ago',()=>{expect(latestAdultBirthdate(new Date(2026,8,6,9))).toBe('2008-09-06');});
  it('keeps the value only for the OAuth redirect tab and consumes it once',()=>{const store=new Map<string,string>();vi.stubGlobal('window',{sessionStorage:{setItem:(key:string,value:string)=>store.set(key,value),getItem:(key:string)=>store.get(key)??null,removeItem:(key:string)=>store.delete(key)}});rememberPendingBirthdate('1990-01-15');expect(consumePendingBirthdate()).toBe('1990-01-15');expect(consumePendingBirthdate()).toBeNull();vi.unstubAllGlobals();});
});
