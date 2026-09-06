import{clearConversationMessageWarmup}from'./conversationMessageWarmup';
import{clearGroupDetailCache}from'./groupDetailCache';
import{clearVoicePreviewSessionCache}from'./voicePreviewCache';

/** Clears account-scoped data and decoded media when the authenticated account changes. */
export async function clearPrivateClientCaches(){
  clearConversationMessageWarmup();
  clearGroupDetailCache();
  clearVoicePreviewSessionCache();
  try{
    const{Image}=await import('expo-image');
    await Image.clearMemoryCache();
    await Image.clearDiskCache();
  }catch{/* Cache removal must not prevent sign-out or account switching. */}
}
