import{describe,expect,it}from'vitest';
import{resolveGroupPhotoSubjects}from'./group-media';

const participants=[
  {characterInstanceId:'mara',name:'Mara Vale'},
  {characterInstanceId:'priya',name:'Priya Shah'},
  {characterInstanceId:'evelyn',name:'Evelyn Hart'},
];

describe('group photo subjects',()=>{
  it('keeps explicit UI selection authoritative and bounded',()=>{
    expect(resolveGroupPhotoSubjects({text:'Send a photo.',participants,explicitSubjectCharacterInstanceIds:['priya','mara'],fallbackSpeakerCharacterInstanceId:'mara'})).toMatchObject({ok:true,subjectCharacterInstanceIds:['priya','mara'],reason:'explicit_selection'});
    expect(resolveGroupPhotoSubjects({text:'Everyone send a photo.',participants,explicitSubjectCharacterInstanceIds:['mara','priya','evelyn']})).toMatchObject({ok:false,code:'TOO_MANY_SUBJECTS'});
  });
  it('resolves two named companions without confusing the floor with the subjects',()=>{
    expect(resolveGroupPhotoSubjects({text:'Mara and Priya, send a photo together.',participants,mentionedCharacterInstanceIds:['mara','priya'],fallbackSpeakerCharacterInstanceId:'mara'})).toMatchObject({ok:true,subjectCharacterInstanceIds:['mara','priya']});
    expect(resolveGroupPhotoSubjects({text:'Mara, take a photo of Priya.',participants,mentionedCharacterInstanceIds:['mara','priya'],fallbackSpeakerCharacterInstanceId:'mara'})).toMatchObject({ok:true,subjectCharacterInstanceIds:['priya']});
    expect(resolveGroupPhotoSubjects({text:'Mara, send me a photo of you and Priya.',participants,fallbackSpeakerCharacterInstanceId:'mara'})).toMatchObject({ok:true,subjectCharacterInstanceIds:['mara','priya']});
  });
  it('does not silently crop a whole group to two people',()=>{
    expect(resolveGroupPhotoSubjects({text:'All of you send a group selfie.',participants,fallbackSpeakerCharacterInstanceId:'mara'})).toMatchObject({ok:false,code:'TOO_MANY_SUBJECTS'});
  });
  it('resolves pair language only when the pair is unambiguous',()=>{
    expect(resolveGroupPhotoSubjects({text:'Both of you send a selfie.',participants:participants.slice(0,2),fallbackSpeakerCharacterInstanceId:'mara'})).toMatchObject({ok:true,subjectCharacterInstanceIds:['mara','priya']});
    expect(resolveGroupPhotoSubjects({text:'Both of you send a selfie.',participants,fallbackSpeakerCharacterInstanceId:'mara'})).toMatchObject({ok:false,code:'AMBIGUOUS_PAIR'});
  });
  it('falls back to the selected speaker for ordinary requests',()=>{
    expect(resolveGroupPhotoSubjects({text:'Send me a selfie.',participants,fallbackSpeakerCharacterInstanceId:'evelyn'})).toMatchObject({ok:true,subjectCharacterInstanceIds:['evelyn'],reason:'speaker_fallback'});
  });
});
