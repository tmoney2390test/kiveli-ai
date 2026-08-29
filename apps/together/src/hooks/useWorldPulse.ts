import { useQuery } from '@tanstack/react-query';
import { loadWorldPulse } from '../lib/api';

export function useWorldPulse(worldId?:string|null,enabled=true){return useQuery({queryKey:['kivelle-world-pulse',worldId??'active'],queryFn:()=>loadWorldPulse(worldId??undefined),enabled:enabled&&Boolean(worldId),staleTime:120_000,gcTime:15*60_000,retry:1,refetchOnWindowFocus:false});}
