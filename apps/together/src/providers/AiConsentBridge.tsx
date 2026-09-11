import {useEffect,useRef,useState} from 'react';
import {AppState,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useAuth} from '../hooks/useAuth';
import {manageAccount} from '../lib/api';
import {AiConsentCheckError,installAiConsentHandler,invalidateAiConsent} from '../lib/aiConsent';
import {colors} from '../theme';

type Disclosure={version:string;providers:string[];dataCategories:string[]};
type Choice={aiDataConsent:{allowsProviderCalls:boolean};disclosure:Disclosure};
export function AiConsentBridge(){
  const {session}=useAuth();const userId=session?.user.id??null;
  const [disclosure,setDisclosure]=useState<Disclosure|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const previousAccepted=useRef(false);
  const pending=useRef<{userId:string;resolve:(accepted:boolean)=>void;reject:(error:unknown)=>void;promise:Promise<boolean>}|null>(null);
  const owner=useRef(userId);owner.current=userId;
  useEffect(()=>{
    const remove=installAiConsentHandler((requestedUser,review)=>{
      if(!requestedUser||owner.current!==requestedUser)return Promise.reject(new AiConsentCheckError());
      if(pending.current)return pending.current.userId===requestedUser?pending.current.promise:Promise.reject(new AiConsentCheckError());
      let resolve!:(accepted:boolean)=>void;
      let reject!:(error:unknown)=>void;
      const promise=new Promise<boolean>((done,fail)=>{resolve=done;reject=fail;});
      const request={userId:requestedUser,resolve,reject,promise};pending.current=request;
      // Return the shared promise immediately so cleanup and network errors
      // reject every waiter, rather than masquerading as a privacy decision.
      void manageAccount<Choice>({action:'privacy_choices_status'}).then(choice=>{
        if(pending.current!==request||owner.current!==requestedUser){reject(new AiConsentCheckError());return;}
        if(typeof choice?.aiDataConsent?.allowsProviderCalls!=='boolean')throw new AiConsentCheckError();
        if(choice.aiDataConsent.allowsProviderCalls&&!review){pending.current=null;resolve(true);return;}
        previousAccepted.current=choice.aiDataConsent.allowsProviderCalls;
        setError('');setDisclosure(choice.disclosure);
      }).catch(error=>{if(pending.current===request)pending.current=null;reject(error);});
      return promise;
    });
    const foreground=AppState.addEventListener('change',()=>invalidateAiConsent());
    return()=>{remove();foreground.remove();pending.current?.reject(new AiConsentCheckError());pending.current=null;setDisclosure(null);setBusy(false);};
  },[userId]);
  const decide=async(decision:'accepted'|'declined'|'withdrawn')=>{
    const request=pending.current;if(!request||!disclosure||busy)return;
    setBusy(true);setError('');
    try{
      const result=await manageAccount<Pick<Choice,'aiDataConsent'>>({action:'ai_consent',decision,disclosureVersion:disclosure.version,source:'privacy'});
      if(pending.current!==request||owner.current!==request.userId)return;
      if(typeof result?.aiDataConsent?.allowsProviderCalls!=='boolean')throw new AiConsentCheckError();
      pending.current=null;setDisclosure(null);request.resolve(result.aiDataConsent.allowsProviderCalls);
    }catch{if(pending.current===request)setError('Could not save your choice. Please try again.');}
    finally{if(owner.current===request.userId)setBusy(false);}
  };
  const dismiss=()=>{if(busy)return;pending.current?.resolve(false);pending.current=null;setDisclosure(null);};
  return <Modal visible={Boolean(disclosure)} transparent animationType="fade" onRequestClose={dismiss} accessibilityViewIsModal><View style={styles.backdrop}><Pressable accessibilityLabel="Close AI sharing disclosure" style={StyleSheet.absoluteFill} onPress={dismiss}/><View style={styles.panel}><ScrollView><Text accessibilityRole="header" style={styles.title}>AI data sharing</Text><Text style={styles.copy}>To respond, Kivelli shares relevant context with the AI provider used for that feature.</Text><Text style={styles.copy}>{disclosure?.providers.join(', ')}</Text><Text style={styles.copy}>{disclosure?.dataCategories.join('; ')}.</Text><Text style={styles.copy}>You can change this in Privacy settings. Declining leaves your account, history, support, and deletion available.</Text>{error?<Text accessibilityRole="alert" style={styles.copy}>{error}</Text>:null}<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void decide('accepted')} style={styles.button}><Text style={styles.buttonText}>{busy?'Saving…':'Allow and continue'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void decide(previousAccepted.current?'withdrawn':'declined')} style={styles.secondary}><Text style={styles.copy}>Do not allow</Text></Pressable></ScrollView></View></View></Modal>;
}
const styles=StyleSheet.create({backdrop:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#000B',padding:20},panel:{width:'100%',maxWidth:480,maxHeight:'85%',padding:24,borderRadius:24,backgroundColor:colors.surface},title:{fontSize:24,fontWeight:'700',color:colors.text,marginBottom:12},copy:{color:colors.muted,fontSize:15,lineHeight:22,marginBottom:14},button:{padding:16,borderRadius:16,borderWidth:1,borderColor:colors.violet,alignItems:'center'},buttonText:{color:colors.text,fontWeight:'700'},secondary:{paddingTop:18,alignItems:'center',minHeight:48}});
