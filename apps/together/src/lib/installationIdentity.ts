import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY='kivelle.installation.identity.v1';
let pending:Promise<string>|null=null;

/** A random, non-hardware identifier used only as one low-confidence abuse and
 * reliability signal. It is resettable and never grants authorization. */
export function installationIdentity():Promise<string>{
  if(pending)return pending;
  pending=(async()=>{
    const existing=await AsyncStorage.getItem(KEY);
    if(existing&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing))return existing;
    const created=crypto.randomUUID();
    await AsyncStorage.setItem(KEY,created);
    return created;
  })().catch(()=>crypto.randomUUID());
  return pending;
}
