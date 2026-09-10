import {useEffect,useState} from 'react';
import {Pressable,Text} from 'react-native';
import {router} from 'expo-router';
import {ShieldCheck} from 'lucide-react-native';
import {invoke} from '../lib/api';
import {useAuth} from '../hooks/useAuth';
import {colors} from '../theme';
export function AdminConsoleLink(){
 const {session}=useAuth();const [authorized,setAuthorized]=useState(false);
 useEffect(()=>{let live=true;setAuthorized(false);if(session?.user.id)void invoke<{role:string|null}>('together-ops',{action:'access'}).then(r=>{if(live)setAuthorized(!!r.role);}).catch(()=>undefined);return()=>{live=false;};},[session?.user.id]);
 if(!authorized)return null;
 return <Pressable accessibilityRole="button" onPress={()=>router.push('/ops' as never)} style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:16}}><ShieldCheck size={20} color={colors.violet}/><Text style={{color:colors.text,fontSize:15,fontWeight:'600'}}>Admin console</Text></Pressable>;
}
