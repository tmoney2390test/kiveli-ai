import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ImagePlus, X } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { FrostedBackdrop, FrostedSurface } from './FrostedGlass';

export function PhotoSharingPaywallModal({visible,onUpgrade,onClose}:{visible:boolean;onUpgrade:()=>void;onClose:()=>void}){
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View accessibilityViewIsModal accessibilityLabel="Kivelle Plus photo sharing" style={styles.backdrop}>
      <FrostedBackdrop intensity={38}/><Pressable accessibilityLabel="Not now" style={StyleSheet.absoluteFill} onPress={onClose}/>
      <FrostedSurface intensity={88} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={onClose} style={styles.close}><X size={18} color={colors.muted}/></Pressable>
        <View style={styles.icon}><ImagePlus size={28} color="#FFD2E1"/></View>
        <Text accessibilityRole="header" style={styles.title}>Share photos with your characters</Text>
        <Text style={styles.copy}>Let your characters see and naturally react to moments from your life.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Upgrade to Kivelle Plus" onPress={onUpgrade} style={styles.primary}><Text style={styles.primaryText}>Upgrade to Kivelle+</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Not now</Text></Pressable>
      </FrostedSurface>
    </View>
  </Modal>;
}

const styles=StyleSheet.create({backdrop:{flex:1,alignItems:'center',justifyContent:'center',padding:22},card:{width:'100%',maxWidth:430,padding:28,paddingTop:32,borderRadius:radius.xl,alignItems:'center',backgroundColor:'rgba(28,21,39,.94)',borderWidth:1,borderColor:'rgba(239,82,137,.28)'},close:{position:'absolute',right:12,top:12,width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},icon:{width:62,height:62,borderRadius:31,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(239,82,137,.17)',marginBottom:18},title:{fontFamily:'Georgia',fontSize:26,lineHeight:32,color:colors.text,textAlign:'center'},copy:{color:colors.textSecondary,fontSize:15,lineHeight:22,textAlign:'center',marginTop:10,marginBottom:24},primary:{width:'100%',minHeight:52,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:'#D63D78'},primaryText:{color:'#fff',fontSize:15,fontWeight:'900'},secondary:{minWidth:120,minHeight:44,alignItems:'center',justifyContent:'center',marginTop:8},secondaryText:{color:colors.muted,fontSize:13,fontWeight:'800'}});
