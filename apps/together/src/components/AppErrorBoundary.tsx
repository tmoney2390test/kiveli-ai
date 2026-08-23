import React,{useEffect,useRef} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { reportClientError } from '../lib/operations';

type State={error:Error|null};
class Boundary extends React.Component<React.PropsWithChildren<{route:string}>,State>{
  override state:State={error:null};
  static getDerivedStateFromError(error:Error):State{return{error};}
  override componentDidCatch(error:Error,info:React.ErrorInfo){void reportClientError(error,{route:this.props.route,surface:'react_boundary',metadata:{componentStack:Boolean(info.componentStack)}}).catch(()=>undefined);}
  override render(){if(!this.state.error)return this.props.children;return <View style={styles.screen}><View style={styles.glow}/><View style={styles.card}><View style={styles.icon}><AlertTriangle color={colors.warm} size={28}/></View><Text accessibilityRole="header" style={styles.title}>Kivelle hit an unexpected snag</Text><Text style={styles.body}>Your account and conversations are safe. We recorded a private diagnostic without including your messages.</Text><Pressable accessibilityRole="button" onPress={()=>this.setState({error:null})} style={styles.primary}><RotateCcw size={17} color="#fff"/><Text style={styles.primaryText}>Try again</Text></Pressable><Pressable onPress={()=>{this.setState({error:null});router.replace('/home');}} style={styles.secondary}><Text style={styles.secondaryText}>Return home</Text></Pressable></View></View>;}
}
export function AppErrorBoundary({children}:React.PropsWithChildren){const route=usePathname();return <Boundary key={route} route={route}>{children}</Boundary>;}
type NativeErrorHandler=(error:Error,isFatal?:boolean)=>void;
type ErrorUtilsShape={getGlobalHandler?:()=>NativeErrorHandler;setGlobalHandler?:(handler:NativeErrorHandler)=>void};
export function GlobalErrorReporter(){const route=usePathname(),routeRef=useRef(route);routeRef.current=route;useEffect(()=>{
  let reporting=false;
  const report=(value:unknown,surface:string)=>{if(reporting)return;reporting=true;void reportClientError(value,{route:routeRef.current,surface}).catch(()=>undefined).finally(()=>{reporting=false;});};
  if(typeof window!=='undefined'){
    const onError=(event:ErrorEvent)=>report(event.error??event.message,'unhandled_error');
    const onRejection=(event:PromiseRejectionEvent)=>report(event.reason,'unhandled_rejection');
    window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onRejection);
    return()=>{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onRejection);};
  }
  const errorUtils=(globalThis as typeof globalThis&{ErrorUtils?:ErrorUtilsShape}).ErrorUtils,previous=errorUtils?.getGlobalHandler?.();
  if(!errorUtils?.setGlobalHandler)return;
  const handler:NativeErrorHandler=(error,isFatal)=>{report(error,isFatal?'native_fatal':'native_unhandled');previous?.(error,isFatal);};
  errorUtils.setGlobalHandler(handler);return()=>{if(previous)errorUtils.setGlobalHandler?.(previous);};
},[]);return null;}
const styles=StyleSheet.create({screen:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:colors.background,overflow:'hidden'},glow:{position:'absolute',width:380,height:380,borderRadius:190,backgroundColor:'rgba(137,70,190,.18)'},card:{width:'100%',maxWidth:480,padding:28,borderRadius:28,borderWidth:1,borderColor:'rgba(255,255,255,.14)',backgroundColor:'rgba(26,20,40,.94)',alignItems:'center'},icon:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,190,100,.1)'},title:{color:colors.text,fontSize:24,fontWeight:'900',textAlign:'center',marginTop:18},body:{color:colors.muted,lineHeight:21,textAlign:'center',marginTop:10,marginBottom:22},primary:{minHeight:48,width:'100%',borderRadius:radius.md,backgroundColor:colors.violet,flexDirection:'row',gap:9,alignItems:'center',justifyContent:'center'},primaryText:{color:'#fff',fontWeight:'900'},secondary:{padding:14},secondaryText:{color:colors.text,fontWeight:'800'}});
