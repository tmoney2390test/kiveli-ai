import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ChevronLeft, Check, LogOut } from 'lucide-react-native';
import { router } from 'expo-router';
import type { AccountGender } from '@together/domain/src/account-onboarding';
import { normalizePersonaDisplayName } from '@together/domain/src/account-onboarding';
import { BirthdateField } from '../src/components/BirthdateField';
import { Screen } from '../src/components';
import { confirmAdultAge } from '../src/lib/api';
import { validBirthdateEntry } from '../src/lib/pendingBirthdate';
import { resolvePostAuthDestination } from '../src/lib/authRouting';
import { useTogether } from '../src/store/useTogether';
import { useAuth } from '../src/hooks/useAuth';
import { colors, radius } from '../src/theme';

const genderOptions: Array<{value:AccountGender;label:string}> = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Nonbinary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export default function AgeConfirmation() {
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const setSnapshot = useTogether((state) => state.setSnapshot);
  const { signOut } = useAuth();
  const [step,setStep]=useState<1|2>(1);
  const [displayName,setDisplayName]=useState('');
  const [dateOfBirth,setDateOfBirth]=useState('');
  const [gender,setGender]=useState<AccountGender|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const normalizedName=normalizePersonaDisplayName(displayName);

  const leave=async()=>{
    if(busy)return;
    setBusy(true);
    try{await signOut();router.replace('/auth?mode=signin' as never);}finally{setBusy(false);}
  };

  const advance=()=>{
    if(!normalizedName){setError('Enter the name you want Kivellians to use.');return;}
    setError('');
    setStep(2);
  };

  const continueToWorlds = async () => {
    if (!validBirthdateEntry(dateOfBirth)) {setError('Choose your birthdate.');return;}
    if (!gender) {setError('Choose your gender.');return;}
    setBusy(true);
    setError('');
    try {
      const snapshot = await confirmAdultAge({dateOfBirth,displayName:normalizedName,gender});
      setSnapshot(snapshot);
      router.replace(resolvePostAuthDestination({ authenticated: true, snapshot }) as never);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kivelle could not finish your setup.');
    } finally {
      setBusy(false);
    }
  };

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
    <Screen scroll={false} contentStyle={[styles.screen,compact&&styles.screenCompact]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={step===1?'Sign out':'Go back'} disabled={busy} onPress={()=>step===1?void leave():(setError(''),setStep(1))} style={({pressed})=>[styles.back,pressed&&styles.pressed]}>
          {step===1?<LogOut size={21} color={colors.text}/>:<ChevronLeft size={24} color={colors.text}/>}
        </Pressable>
        <View accessibilityLabel={`Step ${step} of 2`} style={styles.progress}>
          <View style={styles.progressActive}/><View style={[styles.progressPart,step===2&&styles.progressActive]}/>
        </View>
      </View>

      {step===1?<View style={styles.content}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[styles.title,compact&&styles.titleCompact]}>What should Kivellians call you?</Text>
          <Text style={styles.subtitle}>This is your default Persona name.</Text>
        </View>
        <TextInput
          accessibilityLabel="Default Persona name"
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          editable={!busy}
          maxLength={50}
          onChangeText={(value)=>{setDisplayName(value);setError('');}}
          onSubmitEditing={advance}
          placeholder="Your name"
          placeholderTextColor={colors.dimmed}
          returnKeyType="next"
          style={[styles.nameInput,error&&styles.inputError]}
          value={displayName}
        />
      </View>:<View style={styles.content}>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.title,compact&&styles.titleCompact]}>When is your birthday?</Text>
          <BirthdateField disabled={busy} hasError={Boolean(error)&&!validBirthdateEntry(dateOfBirth)} value={dateOfBirth} onChange={(value)=>{setDateOfBirth(value);setError('');}}/>
          <Text style={styles.ageNote}>You must be 18 or older.</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.genderTitle}>What is your gender?</Text>
          <View accessibilityRole="radiogroup" style={styles.genderGrid}>{genderOptions.map((option)=>{
            const selected=gender===option.value;
            return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{checked:selected}} disabled={busy} onPress={()=>{setGender(option.value);setError('');}} style={({pressed})=>[styles.genderOption,selected&&styles.genderSelected,pressed&&styles.pressed]}>
              <Text style={[styles.genderLabel,selected&&styles.genderLabelSelected]}>{option.label}</Text>
              {selected?<Check size={17} color={colors.rose}/>:null}
            </Pressable>;
          })}</View>
        </View>
      </View>}

      <View style={styles.footer}>
        {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
        <Pressable accessibilityRole="button" accessibilityState={{disabled:busy||(step===1?!normalizedName:!validBirthdateEntry(dateOfBirth)||!gender)}} disabled={busy||(step===1?!normalizedName:!validBirthdateEntry(dateOfBirth)||!gender)} onPress={()=>step===1?advance():void continueToWorlds()} style={({pressed})=>[styles.continueButton,(busy||(step===1?!normalizedName:!validBirthdateEntry(dateOfBirth)||!gender))&&styles.disabled,pressed&&styles.pressed]}>
          <Text style={styles.continueText}>{busy?'Finishing setup…':'Continue'}</Text>
        </Pressable>
      </View>
    </Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  flex:{flex:1,backgroundColor:colors.background},
  screen:{maxWidth:600,minHeight:'100%',paddingHorizontal:22,paddingTop:24,paddingBottom:28,gap:24},
  screenCompact:{paddingTop:16,paddingBottom:18,gap:18},
  header:{minHeight:52,flexDirection:'row',alignItems:'center',gap:18},
  back:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:colors.elevated,borderWidth:1,borderColor:colors.border},
  progress:{flex:1,flexDirection:'row',gap:9},
  progressPart:{flex:1,height:5,borderRadius:3,backgroundColor:colors.borderBright},
  progressActive:{flex:1,height:5,borderRadius:3,backgroundColor:colors.rose},
  content:{flex:1,gap:28,paddingTop:22},
  copy:{gap:8},section:{gap:12},
  title:{maxWidth:520,color:colors.text,fontSize:42,lineHeight:48,fontWeight:'800',letterSpacing:-1.2},
  titleCompact:{fontSize:35,lineHeight:40},
  subtitle:{color:colors.muted,fontSize:16,lineHeight:23},
  nameInput:{minHeight:76,borderRadius:radius.md,borderWidth:2,borderColor:colors.rose,paddingHorizontal:18,backgroundColor:colors.surface,color:colors.text,fontSize:28,fontWeight:'700'},
  inputError:{borderColor:colors.danger},
  ageNote:{color:colors.muted,fontSize:12},
  genderTitle:{color:colors.text,fontSize:24,lineHeight:30,fontWeight:'800'},
  genderGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  genderOption:{flexGrow:1,flexBasis:'45%',minHeight:54,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:15,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
  genderSelected:{borderColor:colors.rose,backgroundColor:'rgba(216,62,234,.09)'},
  genderLabel:{flexShrink:1,color:colors.muted,fontSize:14,fontWeight:'700'},
  genderLabelSelected:{color:colors.text},
  footer:{gap:10},
  error:{color:'#FF9BA7',fontSize:12,lineHeight:17,textAlign:'center'},
  continueButton:{minHeight:62,alignItems:'center',justifyContent:'center',paddingHorizontal:18,borderRadius:radius.pill,backgroundColor:colors.rose,shadowColor:colors.rose,shadowOpacity:.25,shadowRadius:18,shadowOffset:{width:0,height:8}},
  continueText:{color:'#fff',fontSize:17,fontWeight:'900'},
  disabled:{opacity:.42},pressed:{opacity:.82,transform:[{scale:.99}]},
});
