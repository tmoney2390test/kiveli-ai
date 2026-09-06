import { StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { earliestAdultBirthdate,latestAdultBirthdate } from '../lib/pendingBirthdate';

type Props={value:string;onChange:(value:string)=>void;disabled?:boolean;hasError?:boolean};

export function BirthdateField({value,onChange,disabled=false,hasError=false}:Props){
  return <View style={[styles.shell,hasError&&styles.error,disabled&&styles.disabled]}>
    <input
      aria-label="Birthdate"
      disabled={disabled}
      max={latestAdultBirthdate()}
      min={earliestAdultBirthdate()}
      onChange={(event)=>onChange(event.currentTarget.value)}
      type="date"
      value={value}
      style={{...inputStyle,opacity:value?1:0,cursor:disabled?'not-allowed':'pointer'}}
    />
    {!value?<View pointerEvents="none" style={styles.prompt}>
      <View style={styles.promptCopy}>
        <Text style={styles.promptLabel}>DATE OF BIRTH</Text>
        <Text style={styles.promptValue}>Choose your birthdate</Text>
      </View>
      <CalendarDays size={19} color={colors.muted}/>
    </View>:null}
  </View>;
}

const inputStyle={
  width:'100%',height:48,boxSizing:'border-box' as const,border:0,outline:'none',
  padding:'0 15px',background:'transparent',color:colors.text,colorScheme:'dark' as const,
  fontFamily:'inherit',fontSize:16,
};

const styles=StyleSheet.create({
  shell:{position:'relative',minHeight:50,justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.background,overflow:'hidden'},
  prompt:{...StyleSheet.absoluteFill,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:15},
  promptCopy:{gap:1},
  promptLabel:{color:colors.dimmed,fontSize:8,fontWeight:'900',letterSpacing:.8},
  promptValue:{color:colors.muted,fontSize:14},
  error:{borderColor:'rgba(255,113,129,.52)'},
  disabled:{opacity:.55},
});
