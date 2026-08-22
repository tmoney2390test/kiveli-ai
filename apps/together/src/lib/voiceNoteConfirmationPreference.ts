const PREFIX='kivelle:voice-note-confirmation-hidden:v1';

export function voiceNoteConfirmationKey(userId:string):string{return`${PREFIX}:${userId}`;}
export function storedVoiceNoteConfirmationHidden(value:string|null):boolean{return value==='true';}
