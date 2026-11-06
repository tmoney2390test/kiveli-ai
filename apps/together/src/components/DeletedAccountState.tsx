import {useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,View} from 'react-native';
import {router} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {useAuth} from '../hooks/useAuth';
import {useTogether} from '../store/useTogether';
import {invoke} from '../lib/api/transport';
import {clearSessionSnapshot} from '../lib/sessionSnapshotCache';
import {colors,radius} from '../theme';

export function DeletedAccountState(){
  const {session,signOut}=useAuth(),queryClient=useQueryClient();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const create=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      await invoke('together-account-recreate',{confirmation:'CREATE NEW ACCOUNT'});
      if(session?.user.id)clearSessionSnapshot(session.user.id);
      queryClient.clear();
      const state=useTogether.getState();state.clear();
      router.replace('/age-confirmation');
      await state.refresh({force:true});
    }catch(caught){setError(caught instanceof Error?caught.message:'Your new account could not be created.');}
    finally{setBusy(false);}
  };
  const leave=async()=>{if(busy)return;setBusy(true);try{await signOut();useTogether.getState().clear();router.replace('/auth?mode=signin');}catch(caught){setError(caught instanceof Error?caught.message:'Please try again.');}finally{setBusy(false);}};
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>Start fresh?</Text>
    <Text style={styles.body}>Your previous Kivelli account was deleted. You can create a new account with this sign-in. Your previous conversations, memories, and media will stay deleted.</Text>
    {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    <Pressable accessibilityRole="button" accessibilityLabel="Create a new account" disabled={busy} onPress={()=>void create()} style={styles.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.label}>Create a new account</Text>}</Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void leave()} style={styles.secondary}><Text style={styles.body}>Back to sign in</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({page:{flex:1,minHeight:400,padding:28,alignItems:'center',justifyContent:'center',gap:20,backgroundColor:colors.background},title:{fontSize:28,fontWeight:'800',color:colors.text},body:{maxWidth:440,color:colors.muted,fontSize:15,lineHeight:23,textAlign:'center'},error:{color:colors.danger,maxWidth:440,textAlign:'center'},button:{minHeight:50,minWidth:230,padding:16,alignItems:'center',justifyContent:'center',borderRadius:radius.md,backgroundColor:colors.rose},label:{color:'#fff',fontWeight:'800',fontSize:16},secondary:{minHeight:48,justifyContent:'center'}});
