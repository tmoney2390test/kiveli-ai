import { useMemo,useState } from 'react';
import { Modal,Platform,Pressable,StyleSheet,Text,View } from 'react-native';
import DateTimePicker,{type DateTimePickerEvent} from '@react-native-community/datetimepicker';
import { ChevronDown,X } from 'lucide-react-native';
import { colors,radius,typography } from '../theme';
import { birthdateDate,earliestAdultBirthdate,formatBirthdateLabel,latestAdultBirthdate } from '../lib/pendingBirthdate';

type Props={value:string;onChange:(value:string)=>void;disabled?:boolean;hasError?:boolean};

export function BirthdateField({value,onChange,disabled=false,hasError=false}:Props){
  const [open,setOpen]=useState(false);
  const maximumDate=useMemo(()=>birthdateDate(latestAdultBirthdate())??new Date(),[]);
  const minimumDate=useMemo(()=>birthdateDate(earliestAdultBirthdate())??new Date(1900,0,1,12),[]);
  const selected=birthdateDate(value)??maximumDate;
  const parts=birthdateParts(value);
  const choose=(event:DateTimePickerEvent,date?:Date)=>{
    if(Platform.OS==='android')setOpen(false);
    if(event.type==='set'&&date)onChange(localIsoDate(date));
  };
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value?`Birthdate, ${formatBirthdateLabel(value)}. Choose another date.`:'Choose your birthdate'}
      disabled={disabled}
      onPress={()=>setOpen(true)}
      style={({pressed})=>[styles.field,hasError&&styles.error,disabled&&styles.disabled,pressed&&!disabled&&styles.pressed]}
    >
      <BirthdateSegments {...parts} hasValue={Boolean(value)}/>
    </Pressable>
    {open&&Platform.OS==='android'?<DateTimePicker mode="date" display="calendar" value={selected} minimumDate={minimumDate} maximumDate={maximumDate} onChange={choose}/>:null}
    {open&&Platform.OS==='ios'?<Modal transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close birthdate picker" onPress={()=>setOpen(false)} style={StyleSheet.absoluteFill}/>
        <View style={styles.sheet}>
          <View style={styles.header}><Text style={styles.title}>Choose your birthdate</Text><Pressable accessibilityLabel="Close" onPress={()=>setOpen(false)} style={styles.close}><X size={20} color={colors.text}/></Pressable></View>
          <DateTimePicker mode="date" display="inline" themeVariant="dark" accentColor={colors.rose} value={selected} minimumDate={minimumDate} maximumDate={maximumDate} onChange={choose}/>
          <Pressable accessibilityRole="button" onPress={()=>setOpen(false)} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable>
        </View>
      </View>
    </Modal>:null}
  </>;
}

function localIsoDate(date:Date):string{
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function birthdateParts(value:string){
  const date=birthdateDate(value);
  return date?{month:date.toLocaleDateString(undefined,{month:'long'}),day:String(date.getDate()),year:String(date.getFullYear())}:{month:'Month',day:'Day',year:'Year'};
}

function BirthdateSegments({month,day,year,hasValue}:{month:string;day:string;year:string;hasValue:boolean}){
  return <View style={styles.segments}>
    {[[month,'month'],[day,'day'],[year,'year']].map(([label,key],index)=><View key={key} style={[styles.segment,index>0&&styles.segmentBorder]}>
      <Text numberOfLines={1} style={[styles.value,!hasValue&&styles.placeholder]}>{label}</Text>
      <ChevronDown size={17} color={colors.muted}/>
    </View>)}
  </View>;
}

const styles=StyleSheet.create({
  field:{minHeight:58,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.background,overflow:'hidden'},
  error:{borderColor:'rgba(255,113,129,.52)'},disabled:{opacity:.55},pressed:{borderColor:colors.borderBright},
  segments:{minHeight:56,flexDirection:'row',alignItems:'stretch'},segment:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:5,paddingHorizontal:14},segmentBorder:{borderLeftWidth:1,borderLeftColor:colors.border},
  value:{flexShrink:1,color:colors.text,fontSize:15,fontWeight:'700'},placeholder:{color:colors.muted,fontWeight:'600'},
  backdrop:{flex:1,justifyContent:'flex-end',padding:14,backgroundColor:'rgba(3,2,7,.72)'},
  sheet:{borderRadius:radius.xl,borderWidth:1,borderColor:colors.borderBright,backgroundColor:colors.surface,padding:16,paddingBottom:24,gap:12},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{fontFamily:typography.display,color:colors.text,fontSize:24,fontWeight:'600'},
  close:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.elevated},
  done:{minHeight:50,alignItems:'center',justifyContent:'center',borderRadius:radius.md,backgroundColor:colors.rose},doneText:{color:'#fff',fontSize:15,fontWeight:'900'},
});
