import{useEffect,useState}from'react';
import{ActivityIndicator,Modal,Pressable,StyleSheet,Text,View}from'react-native';
import{Check,Coins,Volume2,X}from'lucide-react-native';
import{colors,radius}from'../theme';
import{FrostedBackdrop,FrostedSurface}from'./FrostedGlass';

type Props={visible:boolean;name:string;creditCost:number;creditBalance:number;busy:boolean;onConfirm:(hideFuture:boolean)=>void;onClose:()=>void;onBuyCredits:()=>void};

export function VoiceNotePurchaseModal({visible,name,creditCost,creditBalance,busy,onConfirm,onClose,onBuyCredits}:Props){
  const[hideFuture,setHideFuture]=useState(false),canAfford=creditBalance>=creditCost;
  useEffect(()=>{if(visible)setHideFuture(false);},[visible]);
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={busy?undefined:onClose}>
    <Pressable accessibilityLabel="Close voice generation confirmation" style={styles.backdrop} onPress={busy?undefined:onClose}>
      <FrostedBackdrop intensity={38}/>
      <Pressable style={styles.frame} onPress={()=>undefined}>
        <FrostedSurface intensity={92} style={styles.card}>
          <View style={styles.header}><View style={styles.icon}><Volume2 size={23} color={colors.rose}/></View><Pressable accessibilityLabel="Close" disabled={busy} onPress={onClose} style={styles.close}><X size={18} color={colors.muted}/></Pressable></View>
          <Text style={styles.title}>Generate voice note?</Text>
          <Text style={styles.copy}>Hear this message in {name}&apos;s selected voice.</Text>
          <View style={styles.price}><Coins size={21} color={colors.warm}/><Text style={styles.priceNumber}>{creditCost}</Text><View><Text style={styles.priceLabel}>KIVELLE CREDITS</Text><Text style={styles.balance}>{creditBalance.toLocaleString()} available</Text></View></View>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:hideFuture}} accessibilityLabel="Don't show this confirmation again" disabled={busy} onPress={()=>setHideFuture((value)=>!value)} style={styles.checkboxRow}><View style={[styles.checkbox,hideFuture&&styles.checkboxChecked]}>{hideFuture?<Check size={13} color="#fff" strokeWidth={3}/>:null}</View><Text style={styles.checkboxText}>Don&apos;t show this again</Text></Pressable>
          <View style={styles.actions}><Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={[styles.secondary,busy&&styles.disabled]}><Text style={styles.secondaryText}>Not now</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={canAfford?()=>onConfirm(hideFuture):onBuyCredits} style={[styles.primary,busy&&styles.disabled]}>{busy?<ActivityIndicator size="small" color="#fff"/>:null}<Text style={styles.primaryText}>{busy?'Generating…':canAfford?'Generate audio':'Get credits'}</Text></Pressable></View>
        </FrostedSurface>
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles=StyleSheet.create({
  backdrop:{flex:1,alignItems:'center',justifyContent:'center',padding:20},frame:{width:'100%',maxWidth:430},card:{width:'100%',padding:24,borderRadius:radius.xl,borderColor:'rgba(216,62,234,.30)',backgroundColor:'rgba(29,22,40,.94)',shadowColor:'#7A42E8',shadowOpacity:.3,shadowRadius:30,shadowOffset:{width:0,height:16}},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},icon:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.12)',borderWidth:1,borderColor:'rgba(216,62,234,.24)'},close:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.04)'},
  title:{color:colors.text,fontFamily:'Georgia',fontSize:27,marginTop:17},copy:{color:colors.textSecondary,fontSize:13,lineHeight:19,marginTop:7},price:{marginTop:20,minHeight:72,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,borderRadius:radius.lg,backgroundColor:'rgba(255,190,112,.07)',borderWidth:1,borderColor:'rgba(255,190,112,.18)'},priceNumber:{color:colors.text,fontSize:31,fontWeight:'900'},priceLabel:{color:colors.warm,fontSize:9,fontWeight:'900',letterSpacing:1},balance:{color:colors.muted,fontSize:10,marginTop:2},
  checkboxRow:{minHeight:44,marginTop:12,flexDirection:'row',alignItems:'center',gap:10},checkbox:{width:20,height:20,borderRadius:6,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.28)',backgroundColor:'rgba(255,255,255,.035)'},checkboxChecked:{backgroundColor:colors.rose,borderColor:colors.rose},checkboxText:{color:colors.textSecondary,fontSize:12,fontWeight:'700'},
  actions:{flexDirection:'row',gap:9,marginTop:13},secondary:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:colors.border},secondaryText:{color:colors.text,fontSize:11,fontWeight:'900'},primary:{flex:1,minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderRadius:radius.md,backgroundColor:colors.rose},primaryText:{color:'#fff',fontSize:11,fontWeight:'900'},disabled:{opacity:.55},
});
