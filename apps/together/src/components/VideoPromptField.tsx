import{useRef,useState}from'react';
import{ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View}from'react-native';
import{RotateCcw,Sparkles}from'lucide-react-native';
import{colors,radius}from'../theme';

type Props={value:string;onChange:(value:string)=>void;onEnhance:(prompt:string)=>Promise<string>;placeholder:string;helper:string;suggestions:string[];testID:string;disabled?:boolean};

export function VideoPromptField({value,onChange,onEnhance,placeholder,helper,suggestions,testID,disabled=false}:Props){
  const[enhancing,setEnhancing]=useState(false),[enhancedValue,setEnhancedValue]=useState<string|null>(null),[error,setError]=useState<string|null>(null),original=useRef<string|null>(null);
  const update=(next:string)=>{onChange(next);setError(null);if(next!==enhancedValue){setEnhancedValue(null);original.current=null;}};
  const enhance=async()=>{if(disabled||enhancing||value.trim().length<2)return;setEnhancing(true);setError(null);const before=value;try{const next=await onEnhance(before.trim());original.current=before;setEnhancedValue(next);onChange(next);}catch(cause){setError(cause instanceof Error?cause.message:'The prompt could not be enhanced. Your original is unchanged.');}finally{setEnhancing(false);}};
  const revert=()=>{if(original.current===null)return;const previous=original.current;original.current=null;setEnhancedValue(null);setError(null);onChange(previous);};
  const enhanced=enhancedValue!==null&&value===enhancedValue;
  return <View style={styles.root}>
    <TextInput testID={testID} accessibilityLabel="Describe the video you want" value={value} onChangeText={update} placeholder={placeholder} placeholderTextColor={colors.dimmed} maxLength={400} multiline style={styles.input}/>
    <View style={styles.promptMeta}><Text accessibilityLiveRegion="polite" style={styles.count}>{value.length}/400 · {helper}</Text><Pressable testID={`${testID}-enhance`} accessibilityRole="button" accessibilityLabel={enhanced?'Restore original video prompt':'Enhance video prompt'} accessibilityState={{disabled:disabled||enhancing||value.trim().length<2,busy:enhancing}} disabled={disabled||enhancing||value.trim().length<2} onPress={()=>void(enhanced?revert():enhance())} style={[styles.enhance,(disabled||value.trim().length<2)&&styles.disabled]}>{enhancing?<ActivityIndicator size="small" color="#FFBBD2"/>:enhanced?<RotateCcw size={14} color="#FFBBD2"/>:<Sparkles size={14} color="#FFBBD2"/>}<Text style={styles.enhanceText}>{enhancing?'Enhancing…':enhanced?'Undo':'Enhance'}</Text></Pressable></View>
    {enhanced?<Text accessibilityLiveRegion="polite" style={styles.enhanced}>Enhanced for the selected model. You can still edit it.</Text>:null}
    {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    <View style={styles.suggestions}>{suggestions.map((suggestion)=><Pressable key={suggestion} accessibilityRole="button" onPress={()=>update(suggestion)} style={styles.suggestion}><Text style={styles.suggestionText}>{suggestion}</Text></Pressable>)}</View>
  </View>;
}

const styles=StyleSheet.create({root:{width:'100%'},input:{width:'100%',minHeight:106,maxHeight:180,borderRadius:radius.lg,borderWidth:1,borderColor:'rgba(203,168,255,.24)',backgroundColor:'rgba(4,5,10,.58)',padding:14,color:colors.text,fontSize:15,textAlignVertical:'top'},promptMeta:{marginTop:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},count:{flex:1,color:colors.muted,fontSize:10,lineHeight:15},enhance:{minHeight:40,paddingHorizontal:12,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(239,82,137,.36)',backgroundColor:'rgba(239,82,137,.10)',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},enhanceText:{color:'#FFBBD2',fontSize:11,fontWeight:'900'},disabled:{opacity:.42},enhanced:{color:'#A7F2CF',fontSize:10,marginTop:5},error:{color:colors.danger,fontSize:11,lineHeight:16,marginTop:7},suggestions:{marginTop:10,flexDirection:'row',flexWrap:'wrap',gap:8},suggestion:{minHeight:38,paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(203,168,255,.16)',backgroundColor:'rgba(255,255,255,.035)',justifyContent:'center'},suggestionText:{color:colors.textSecondary,fontSize:10,fontWeight:'700'}});
