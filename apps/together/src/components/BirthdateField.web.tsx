import { StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { birthdateDate,earliestAdultBirthdate,latestAdultBirthdate } from '../lib/pendingBirthdate';

type Props={value:string;onChange:(value:string)=>void;disabled?:boolean;hasError?:boolean};

export function BirthdateField({value,onChange,disabled=false,hasError=false}:Props){
  const date=birthdateDate(value);
  const parts=date?[date.toLocaleDateString(undefined,{month:'long'}),String(date.getDate()),String(date.getFullYear())]:['Month','Day','Year'];
  return <View style={[styles.shell,hasError&&styles.error,disabled&&styles.disabled]}>
    <input
      aria-label="Birthdate"
      disabled={disabled}
      max={latestAdultBirthdate()}
      min={earliestAdultBirthdate()}
      onChange={(event)=>onChange(event.currentTarget.value)}
      type="date"
      value={value}
      style={{...inputStyle,cursor:disabled?'not-allowed':'pointer'}}
    />
    <View pointerEvents="none" style={styles.segments}>{parts.map((part,index)=><View key={index} style={[styles.segment,index>0&&styles.segmentBorder]}><Text numberOfLines={1} style={[styles.value,!value&&styles.placeholder]}>{part}</Text><ChevronDown size={17} color={colors.muted}/></View>)}</View>
  </View>;
}

const inputStyle={
  position:'absolute' as const,inset:0,width:'100%',height:'100%',boxSizing:'border-box' as const,border:0,outline:'none',
  padding:0,background:'transparent',color:'transparent',opacity:0,colorScheme:'dark' as const,
};

const styles=StyleSheet.create({
  shell:{position:'relative',minHeight:58,justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.background,overflow:'hidden'},
  segments:{minHeight:56,flexDirection:'row',alignItems:'stretch'},segment:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:5,paddingHorizontal:14},segmentBorder:{borderLeftWidth:1,borderLeftColor:colors.border},
  value:{flexShrink:1,color:colors.text,fontSize:15,fontWeight:'700'},placeholder:{color:colors.muted,fontWeight:'600'},
  error:{borderColor:'rgba(255,113,129,.52)'},
  disabled:{opacity:.55},
});
