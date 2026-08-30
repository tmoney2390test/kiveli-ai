import{useEffect,useState}from'react';
import{ActivityIndicator,Modal,Platform,Pressable,StyleSheet,Text,useWindowDimensions,View}from'react-native';
import{useVideoPlayer,VideoView}from'expo-video';
import{Minimize2,Volume2}from'lucide-react-native';
import{useSafeAreaInsets}from'react-native-safe-area-context';
import{containedMediaFrame}from'../lib/mediaViewer';
import{colors,radius}from'../theme';
import{WebVideoSurface}from'./WebVideoSurface';

export function VideoLightbox({visible,uri,aspectRatio,onClose}:{visible:boolean;uri:string;aspectRatio:number;onClose:()=>void}){
  const{width,height}=useWindowDimensions(),insets=useSafeAreaInsets(),[ready,setReady]=useState(false);
  const player=useVideoPlayer(uri,(instance)=>{instance.loop=true;instance.muted=false;});
  useEffect(()=>{setReady(false);if(!visible)player.pause();},[player,uri,visible]);
  const controlsSpace=Platform.OS==='web'?24:Math.max(16,insets.bottom),topSpace=Platform.OS==='web'?24:Math.max(16,insets.top);
  const frame=containedMediaFrame({width,height},aspectRatio,12);
  return <Modal visible={visible} transparent statusBarTranslucent supportedOrientations={['portrait','portrait-upside-down','landscape-left','landscape-right']} animationType="fade" onRequestClose={onClose}>
    <View testID="full-screen-video" accessibilityViewIsModal style={styles.root}>
      <View style={[styles.stage,{paddingTop:topSpace,paddingBottom:controlsSpace}]}>
        <View style={[styles.frame,{width:frame.width,height:frame.height}]}>
          {Platform.OS==='web'?<WebVideoSurface uri={uri} accessibilityLabel="Full-screen companion video" active={visible} autoPlay muted loop onReady={()=>setReady(true)}/>:<VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls playsInline fullscreenOptions={{enable:true,orientation:'default'}} onFirstFrameRender={()=>setReady(true)}/>}
          {!ready?<View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.rose}/><Text style={styles.loadingText}>Loading full video…</Text></View>:null}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close full-screen video" onPress={onClose} style={({pressed})=>[styles.close,{top:topSpace},pressed&&styles.pressed]}><Minimize2 size={21} color="#fff"/></Pressable>
      <View pointerEvents="none" style={[styles.hint,{bottom:controlsSpace+8}]}><Volume2 size={13} color={colors.textSecondary}/><Text style={styles.hintText}>Use the player controls for sound and playback</Text></View>
    </View>
  </Modal>;
}

const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#020207'},stage:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:6},frame:{maxWidth:'100%',maxHeight:'100%',overflow:'hidden',backgroundColor:'#000',borderRadius:Platform.OS==='web'?radius.md:0},loading:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#05050A'},loadingText:{color:colors.textSecondary,fontSize:11,fontWeight:'700'},close:{position:'absolute',right:16,width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(20,16,27,.82)',borderWidth:1,borderColor:'rgba(255,255,255,.22)'},hint:{position:'absolute',alignSelf:'center',left:24,right:24,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},hintText:{color:colors.textSecondary,fontSize:10,fontWeight:'700',textAlign:'center'},pressed:{opacity:.72,transform:[{scale:.96}]}});
