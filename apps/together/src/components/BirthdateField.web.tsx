import { StyleSheet, View } from 'react-native';
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
      style={inputStyle}
    />
  </View>;
}

const inputStyle={
  width:'100%',height:48,boxSizing:'border-box' as const,border:0,outline:'none',
  padding:'0 15px',background:'transparent',color:colors.text,colorScheme:'dark' as const,
  fontFamily:'inherit',fontSize:16,
};

const styles=StyleSheet.create({
  shell:{minHeight:50,justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.background,overflow:'hidden'},
  error:{borderColor:'rgba(255,113,129,.52)'},
  disabled:{opacity:.55},
});
