import {useEffect,useState} from 'react';
import type {Scenario} from '../lib/scenarioCatalog';
let cached:Scenario[]|null=null;
let pending:Promise<Scenario[]>|null=null;
const empty:Scenario[]=[];
export function loadScenarioCatalog():Promise<Scenario[]>{
 if(cached)return Promise.resolve(cached);
 if(!pending)pending=import('../lib/scenarioCatalog').then(m=>{cached=m.scenarios;return cached;}).finally(()=>{pending=null;});
 return pending;
}
export function useScenarioCatalog(){
 const [scenarios,setScenarios]=useState(cached??empty),[loading,setLoading]=useState(!cached),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;setLoading(!cached);setError(false);void loadScenarioCatalog().then(rows=>{if(live)setScenarios(rows);}).catch(()=>{if(live)setError(true);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[attempt]);
 return {scenarios,loading,error,retry:()=>setAttempt(a=>a+1)};
}
