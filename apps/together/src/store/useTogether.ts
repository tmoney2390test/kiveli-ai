import { create } from 'zustand';
import { loadSnapshot } from '../lib/api';
import type { Snapshot } from '../types';
import { demoSnapshot } from '../demo';

type State={snapshot:Snapshot|null;loading:boolean;error:string|null;setSnapshot:(snapshot:Snapshot)=>void;refresh:()=>Promise<void>;clear:()=>void};
const demoMode=__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true';
export const useTogether=create<State>((set)=>({snapshot:demoMode?demoSnapshot:null,loading:false,error:null,setSnapshot:(snapshot)=>set({snapshot,error:null}),refresh:async()=>{if(demoMode)return;set({loading:true,error:null});try{set({snapshot:await loadSnapshot(),loading:false});}catch(error){set({loading:false,error:error instanceof Error?error.message:'Could not load Together.'});}},clear:()=>set({snapshot:demoMode?demoSnapshot:null,error:null})}));
