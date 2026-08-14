import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { characterAssets } from '../../src/assets';
import { Body, DateChoice, DateScene, GradientButton, LoadingSkeleton, Screen } from '../../src/components';
import { colors } from '../../src/theme';
import { useTogether } from '../../src/store/useTogether';
import { mutateDate } from '../../src/lib/api';
import type { DateSession } from '../../src/types';

type ChoiceResult={session:DateSession;narrative:string;completed:boolean};
export default function DateExperience(){const{id}=useLocalSearchParams<{id:string}>();const{snapshot,refresh}=useTogether();const[session,setSession]=useState(snapshot?.dates.find((item)=>item.id===id));const[busy,setBusy]=useState(false);const[narrative,setNarrative]=useState('');if(!session)return <LoadingSkeleton/>;const template=session.together_date_templates;const phase=template.phases[session.phase_index]??template.phases[0]!;
  const start=async()=>{setBusy(true);try{const next=await mutateDate<DateSession>({action:'start',sessionId:session.id});setSession(next);}finally{setBusy(false);}};
  const choose=async(choice:{id:string;label:string})=>{setBusy(true);try{const result=await mutateDate<ChoiceResult>({action:'choose',sessionId:session.id,choiceId:choice.id,choiceText:choice.label});setNarrative(result.narrative);setSession(result.session);await refresh();if(result.completed)Alert.alert('A new Moment','Dinner at Juniper is now part of your shared history.',[{text:'View Moment',onPress:()=>router.replace('/moments')}]);}catch(error){Alert.alert('The scene paused',error instanceof Error?error.message:'Try that choice again.');}finally{setBusy(false);}};
  if(session.status==='locked')return <Screen><Body muted>This date will unlock naturally as your relationship with Maya grows.</Body><GradientButton label="Back to Dates" onPress={()=>router.back()}/></Screen>;
  if(session.status!=='active'&&session.status!=='completed')return <Screen><DateScene phase={1} total={8} title="Dinner at Juniper" source={characterAssets.maya!}><Body muted>The restaurant glows against the evening rain. Maya is already inside, pretending she wasn’t watching the door.</Body><GradientButton label={busy?'Getting your table…':'Begin the date'} disabled={busy} onPress={()=>void start()}/></DateScene></Screen>;
  return <Screen><View style={styles.header}><Pressable onPress={()=>router.back()}><X color={colors.text}/></Pressable><Text style={styles.headerTitle}>Dinner at Juniper</Text><Text style={styles.phase}>{session.phase_index+1} of 8</Text></View><DateScene phase={session.phase_index+1} total={8} title={phase.title} source={characterAssets.maya!}><Body>{narrative||sceneCopy(phase.id)}</Body>{session.status==='completed'?<GradientButton label="View your Moments" onPress={()=>router.replace('/moments')}/>:<View style={{gap:10}}>{phase.choices.map((choice,index)=><DateChoice key={choice.id} label={choice.label} primary={index===0} locked={busy} onPress={()=>void choose(choice)}/>)}</View>}</DateScene></Screen>;
}
function sceneCopy(phase:string){const copy:Record<string,string>={arrival:'Maya looks up with a curious smile. The night has the awkward electricity of something neither of you wants to define too quickly.',ordering:'The menu becomes an unexpectedly serious negotiation.',early_conversation:'The first few minutes settle into an easy rhythm.',personal_conversation:'The conversation is getting deeper. Maya looks at you with a curious smile.',unexpected_moment:'Maya has dramatically underestimated the spicy roll.',dessert:'Neither of you seems ready to call the night finished.',after_date:'Outside, the city sounds softer than it did before dinner.',resolution:'Some nights become a shared reference point before they are even over.'};return copy[phase]??'The evening continues.';}
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',gap:12},headerTitle:{flex:1,textAlign:'center',color:colors.text,fontWeight:'800'},phase:{color:colors.muted,fontSize:11}});
