import {Alert,Platform} from 'react-native';
export function confirmScenarioEventTransition():Promise<boolean>{
 const title='Pause this scenario to join?',message='Joining the event pauses this scenario. Your story and chapter progress stay saved. Planning an event does not pause it.';
 if(Platform.OS==='web')return Promise.resolve(typeof window!=='undefined'&&window.confirm(`${title}\n\n${message}`));
 return new Promise(resolve=>Alert.alert(title,message,[{text:'Stay in scenario',style:'cancel',onPress:()=>resolve(false)},{text:'Join event',onPress:()=>resolve(true)}],{cancelable:true,onDismiss:()=>resolve(false)}));
}
