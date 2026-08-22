import type { RealtimeCallState } from './types';

export type RealtimeCallEvent='CREATE'|'SESSION_CREATED'|'CONNECT'|'CONNECTED'|'CONNECTION_LOST'|'RETRY'|'END'|'ENDED'|'FAIL';
const transitions:Record<RealtimeCallState,Partial<Record<RealtimeCallEvent,RealtimeCallState>>>={
  idle:{CREATE:'creating_session',END:'ended'},
  creating_session:{SESSION_CREATED:'ringing',CONNECT:'connecting',END:'ending',FAIL:'failed'},
  ringing:{CONNECT:'connecting',END:'ending',FAIL:'failed'},
  connecting:{CONNECTED:'connected',CONNECTION_LOST:'reconnecting',END:'ending',FAIL:'failed'},
  connected:{CONNECTION_LOST:'reconnecting',END:'ending',FAIL:'failed'},
  reconnecting:{RETRY:'connecting',CONNECTED:'connected',END:'ending',FAIL:'failed'},
  ending:{ENDED:'ended',FAIL:'failed'},
  ended:{CREATE:'creating_session'},failed:{CREATE:'creating_session',END:'ending',ENDED:'ended'},
};
export function transitionRealtimeCall(state:RealtimeCallState,event:RealtimeCallEvent):RealtimeCallState{return transitions[state][event]??state;}
