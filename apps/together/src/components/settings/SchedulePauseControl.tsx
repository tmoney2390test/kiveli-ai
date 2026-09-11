import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import { CalendarClock, Pause, Play } from 'lucide-react-native';
import { schedulePauseConfirmation, schedulePauseFrom, type SchedulePause } from '@together/domain/src/schedule-pause';
import { manageConversation } from '../../lib/api';
import { confirmAction } from '../../lib/dialogs';
import { useTogether } from '../../store/useTogether';
import { colors, radius } from '../../theme';
import type { CharacterInstance, Conversation } from '../../types';

export function SchedulePauseControl({character,conversation,disabled=false}:{character:CharacterInstance;conversation:Conversation;disabled?:boolean}) {
  const stored=useTogether(state=>state.snapshot?.characters.find(item=>item.id===character.id));
  const pause=schedulePauseFrom((stored??character).schedule_pause);
  const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  const toggle=()=>{
    if(disabled||inFlight.current)return;
    const confirmation=schedulePauseConfirmation(Boolean(pause),character.together_character_templates.name);
    confirmAction({...confirmation,onConfirm:async()=>{
      if(inFlight.current)return;
      inFlight.current=true;setBusy(true);
      try{
        const result=await manageConversation<{characterInstanceId:string;schedulePause:SchedulePause|null}>({action:'schedule_pause',conversationId:conversation.id,paused:!pause,confirmation:confirmation.confirmation,expectedPausedAt:pause?.pausedAt??null});
        const store=useTogether.getState(),current=store.snapshot?.characters.find(item=>item.id===result.characterInstanceId&&item.user_id===character.user_id);
        // A response arriving after sign-out or a Life/account switch cannot
        // put the previous companion back into the current account's store.
        if(current){store.updateCompanion({...current,schedule_pause:result.schedulePause});void store.refresh({scope:'presence',characterInstanceId:current.id,force:true}).catch(()=>undefined);}
      }catch(error){Alert.alert('Schedule unchanged',error instanceof Error?error.message:'Please try again.');}
      finally{inFlight.current=false;setBusy(false);}
    }});
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={pause?'Resume companion schedule':'Pause companion schedule'} accessibilityState={{disabled:disabled||busy}} disabled={disabled||busy} onPress={toggle} style={({pressed})=>[styles.control,pressed&&styles.pressed,(disabled||busy)&&styles.disabled]}>
    <CalendarClock size={18} color={colors.violet}/>
    <Text style={styles.label}>{pause?'Resume schedule':'Pause schedule'}</Text>
    {busy?<ActivityIndicator size="small" color={colors.text}/>:pause?<Play size={17} color={colors.textSecondary}/>:<Pause size={17} color={colors.textSecondary}/>}
  </Pressable>;
}

const styles=StyleSheet.create({
  control:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
  label:{flex:1,color:colors.text,fontSize:14,fontWeight:'700'},pressed:{opacity:.8},disabled:{opacity:.5},
});
