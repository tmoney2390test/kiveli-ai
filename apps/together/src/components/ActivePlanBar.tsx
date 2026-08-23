import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, ChevronRight, Play, RefreshCw, Square } from 'lucide-react-native';
import type { SharedPlan } from '../types';
import { colors, radius } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

type ActivePlanBarProps = {
  plan: SharedPlan;
  locationName?: string;
  busy?: boolean;
  onContinue: () => void;
  onChange: () => void;
  onEnd: () => void;
  onDetails: () => void;
};

export function ActivePlanBar({ plan, locationName, busy = false, onContinue, onChange, onEnd, onDetails }: ActivePlanBarProps) {
  return <View accessibilityLabel={`${plan.title}, together now`} style={styles.bar}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${plan.title} details`} onPress={onDetails} style={styles.identity}>
      <View style={styles.icon}><CalendarDays size={16} color={colors.rose}/></View>
      <View style={styles.copy}>
        <Text style={styles.kicker}>TOGETHER NOW</Text>
        <Text numberOfLines={1} style={styles.title}>{plan.title}</Text>
        {locationName?<Text numberOfLines={1} style={styles.location}>{locationName}</Text>:null}
      </View>
      <ChevronRight size={15} color={colors.dimmed}/>
    </Pressable>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Continue ${plan.title}`} disabled={busy} onPress={onContinue} style={[styles.primary,busy&&styles.disabled]}><Play size={13} color="#fff" fill="#fff"/><Text style={styles.primaryText}>Continue</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Change ${plan.title}`} disabled={busy} onPress={onChange} style={[styles.secondary,busy&&styles.disabled]}><RefreshCw size={13} color={colors.rose}/><Text style={styles.secondaryText}>Change</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`End ${plan.title}`} disabled={busy} onPress={onEnd} style={[styles.end,busy&&styles.disabled]}>{busy?<ActivityIndicator size="small" color={colors.danger}/>:<Square size={12} color={colors.danger} fill="rgba(255,100,120,.2)"/>}<Text style={styles.endText}>End</Text></Pressable>
    </View>
  </View>;
}

export function PlanJoinBar({ plan, locationName, busy = false, onJoin, onDetails }: { plan: SharedPlan; locationName?: string; busy?: boolean; onJoin: () => void; onDetails: () => void }) {
  return <View accessibilityLabel={`${plan.title}, ready to join`} style={styles.bar}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${plan.title} details`} onPress={onDetails} style={styles.identity}>
      <View style={styles.icon}><CalendarDays size={16} color={colors.rose}/></View>
      <View style={styles.copy}>
        <Text style={styles.kicker}>PLAN READY</Text>
        <Text numberOfLines={1} style={styles.title}>{plan.title}</Text>
        {locationName?<Text numberOfLines={1} style={styles.location}>{locationName}</Text>:null}
      </View>
      <ChevronRight size={15} color={colors.dimmed}/>
    </Pressable>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Join ${plan.title}`} disabled={busy} onPress={onJoin} style={[styles.primary,busy&&styles.disabled]}>{busy?<ActivityIndicator size="small" color="#fff"/>:<Play size={13} color="#fff" fill="#fff"/>}<Text style={styles.primaryText}>{busy?'Joining…':'Join plan'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${plan.title} details`} disabled={busy} onPress={onDetails} style={[styles.secondary,busy&&styles.disabled]}><Text style={styles.secondaryText}>Details</Text></Pressable>
    </View>
  </View>;
}

export function EndPlanConfirmation({ visible, plan, busy, onConfirm, onClose }: { visible: boolean; plan: SharedPlan | null; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close end plan confirmation" style={styles.backdrop} onPress={busy?undefined:onClose}>
      <FrostedBackdrop intensity={36}/>
      <Pressable style={styles.modalFrame} onPress={()=>undefined}>
        <FrostedSurface intensity={86} style={styles.modal}>
          <View style={styles.modalIcon}><Square size={20} color={colors.rose} fill="rgba(216,62,234,.18)"/></View>
          <Text style={styles.modalTitle}>End this plan?</Text>
          <Text style={styles.modalCopy}>{plan?.title??'This plan'} will be saved to your shared history and the current scene will close.</Text>
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={[styles.modalSecondary,busy&&styles.disabled]}><Text style={styles.modalSecondaryText}>Keep going</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`End ${plan?.title??'plan'} now`} disabled={busy} onPress={onConfirm} style={[styles.modalEnd,busy&&styles.disabled]}>{busy?<ActivityIndicator size="small" color="#fff"/>:null}<Text style={styles.modalEndText}>{busy?'Ending…':'End plan'}</Text></Pressable>
          </View>
        </FrostedSurface>
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles=StyleSheet.create({
  bar:{gap:9,paddingHorizontal:12,paddingVertical:10,borderTopWidth:1,borderTopColor:'rgba(216,62,234,.24)',backgroundColor:'rgba(24,17,32,.98)'},
  identity:{minWidth:0,flexDirection:'row',alignItems:'center',gap:9},
  icon:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.12)',borderWidth:1,borderColor:'rgba(216,62,234,.18)'},
  copy:{flex:1,minWidth:0},kicker:{color:colors.rose,fontSize:8,fontWeight:'900',letterSpacing:1.1},title:{color:colors.text,fontSize:12,fontWeight:'900',marginTop:2},location:{color:colors.muted,fontSize:9,marginTop:1},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:7},
  primary:{minHeight:34,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:12,borderRadius:radius.pill,backgroundColor:colors.rose},primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},
  secondary:{minHeight:34,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:12,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.24)'},secondaryText:{color:colors.text,fontSize:10,fontWeight:'900'},
  end:{minHeight:34,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:12,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(255,100,120,.24)'},endText:{color:colors.danger,fontSize:10,fontWeight:'900'},disabled:{opacity:.5},
  backdrop:{flex:1,alignItems:'center',justifyContent:'center',padding:20},modalFrame:{width:'100%',maxWidth:440},modal:{width:'100%',alignItems:'center',padding:24,borderRadius:radius.xl,borderColor:'rgba(216,62,234,.28)',backgroundColor:'rgba(28,21,39,.92)',shadowColor:'#7A42E8',shadowOpacity:.28,shadowRadius:28,shadowOffset:{width:0,height:14}},
  modalIcon:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.12)',borderWidth:1,borderColor:'rgba(216,62,234,.22)'},modalTitle:{color:colors.text,fontFamily:'Georgia',fontSize:25,marginTop:14},modalCopy:{color:colors.textSecondary,fontSize:13,lineHeight:19,textAlign:'center',marginTop:8,maxWidth:340},
  modalActions:{width:'100%',flexDirection:'row',gap:9,marginTop:22},modalSecondary:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:colors.border},modalSecondaryText:{color:colors.text,fontSize:11,fontWeight:'900'},modalEnd:{flex:1,minHeight:46,flexDirection:'row',gap:7,alignItems:'center',justifyContent:'center',borderRadius:radius.md,backgroundColor:colors.rose},modalEndText:{color:'#fff',fontSize:11,fontWeight:'900'},
});
