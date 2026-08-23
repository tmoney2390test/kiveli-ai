import NetInfo from '@react-native-community/netinfo';
import{createContext,useContext,useEffect,useMemo,useRef,useState,type PropsWithChildren}from'react';

export type ConnectionPhase='online'|'offline'|'reconnected';
type NetworkValue={online:boolean;phase:ConnectionPhase};
const NetworkContext=createContext<NetworkValue>({online:true,phase:'online'});

export function NetworkStatusProvider({children}:PropsWithChildren){const[online,setOnline]=useState(true),[phase,setPhase]=useState<ConnectionPhase>('online'),wasOffline=useRef(false);useEffect(()=>{let reset:ReturnType<typeof setTimeout>|undefined;const unsubscribe=NetInfo.addEventListener((state)=>{const next=state.isConnected!==false&&state.isInternetReachable!==false;setOnline(next);if(!next){wasOffline.current=true;setPhase('offline');if(reset)clearTimeout(reset);}else if(wasOffline.current){wasOffline.current=false;setPhase('reconnected');if(reset)clearTimeout(reset);reset=setTimeout(()=>setPhase('online'),3500);}else setPhase('online');});return()=>{unsubscribe();if(reset)clearTimeout(reset);};},[]);const value=useMemo(()=>({online,phase}),[online,phase]);return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>}
export const useNetworkStatus=()=>useContext(NetworkContext);
