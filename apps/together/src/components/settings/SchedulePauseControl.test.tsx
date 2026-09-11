import { beforeEach, expect, it, vi } from 'vitest';
import { SchedulePauseControl } from './SchedulePauseControl';
import type { CharacterInstance, Conversation } from '../../types';

const mocks=vi.hoisted(()=>({api:vi.fn(),confirm:vi.fn(),alert:vi.fn(),update:vi.fn(),refresh:vi.fn(),busy:vi.fn(),characters:[] as CharacterInstance[]}));
vi.mock('react',()=>({useRef:(value:unknown)=>({current:value}),useState:()=>[false,mocks.busy]}));
vi.mock('react-native',()=>({Pressable:'Pressable',Text:'Text',ActivityIndicator:'ActivityIndicator',Alert:{alert:mocks.alert},StyleSheet:{create:(value:unknown)=>value}}));
vi.mock('lucide-react-native',()=>({CalendarClock:'Icon',Pause:'Icon',Play:'Icon'}));
vi.mock('../../lib/api',()=>({manageConversation:mocks.api}));
vi.mock('../../lib/dialogs',()=>({confirmAction:mocks.confirm}));
vi.mock('../../store/useTogether',()=>({useTogether:Object.assign((select:(state:unknown)=>unknown)=>select({snapshot:{characters:mocks.characters}}),{getState:()=>({snapshot:{characters:mocks.characters},updateCompanion:mocks.update,refresh:mocks.refresh})})}));
const character={id:'companion',user_id:'owner',together_character_templates:{name:'Alex'}} as CharacterInstance;
const conversation={id:'chat',kind:'direct'} as Conversation;
const pause={version:1 as const,pausedAt:'2026-09-11T12:00:00Z',locationId:null,activity:'Reading',activityKey:'reading',interruptibility:'open' as const,state:'relaxing' as const};
beforeEach(()=>{vi.clearAllMocks();mocks.characters=[character];mocks.api.mockResolvedValue({characterInstanceId:character.id,schedulePause:pause});mocks.refresh.mockResolvedValue(undefined);});
it('does not mutate anything until pause is confirmed',async()=>{
  const control=SchedulePauseControl({character,conversation});control.props.onPress();
  expect(mocks.api).not.toHaveBeenCalled();expect(mocks.confirm.mock.calls[0]![0].title).toBe('Pause schedule?');
  await mocks.confirm.mock.calls[0]![0].onConfirm();
  expect(mocks.api).toHaveBeenCalledWith({action:'schedule_pause',conversationId:'chat',paused:true,confirmation:'pause_schedule',expectedPausedAt:null});
  expect(mocks.update).toHaveBeenCalledWith({...character,schedule_pause:pause});
});
it('requires a separate confirmation to resume',async()=>{
  mocks.characters=[{...character,schedule_pause:pause}];mocks.api.mockResolvedValue({characterInstanceId:character.id,schedulePause:null});
  const control=SchedulePauseControl({character,conversation});control.props.onPress();
  expect(mocks.api).not.toHaveBeenCalled();expect(mocks.confirm.mock.calls[0]![0].title).toBe('Resume schedule?');
  await mocks.confirm.mock.calls[0]![0].onConfirm();
  expect(mocks.api).toHaveBeenCalledWith({action:'schedule_pause',conversationId:'chat',paused:false,confirmation:'resume_schedule',expectedPausedAt:pause.pausedAt});
});
it('keeps the old setting after a failed save',async()=>{
  mocks.api.mockRejectedValueOnce(new Error('Offline'));const control=SchedulePauseControl({character,conversation});control.props.onPress();
  await mocks.confirm.mock.calls[0]![0].onConfirm();expect(mocks.update).not.toHaveBeenCalled();expect(mocks.alert).toHaveBeenCalledWith('Schedule unchanged','Offline');
});
it('does not restore another account or Life after an in-flight response',async()=>{
  mocks.api.mockImplementationOnce(()=>{mocks.characters=[];return Promise.resolve({characterInstanceId:character.id,schedulePause:pause});});
  const control=SchedulePauseControl({character,conversation});control.props.onPress();await mocks.confirm.mock.calls[0]![0].onConfirm();
  expect(mocks.update).not.toHaveBeenCalled();expect(mocks.refresh).not.toHaveBeenCalled();
});
it('blocks duplicate submissions while saving',async()=>{
  let complete!:(value:unknown)=>void;mocks.api.mockReturnValueOnce(new Promise(resolve=>{complete=resolve;}));
  const control=SchedulePauseControl({character,conversation});control.props.onPress();const confirm=mocks.confirm.mock.calls[0]![0].onConfirm;
  const pending=confirm();await confirm();control.props.onPress();expect(mocks.api).toHaveBeenCalledTimes(1);expect(mocks.confirm).toHaveBeenCalledTimes(1);
  complete({characterInstanceId:character.id,schedulePause:pause});await pending;
});
