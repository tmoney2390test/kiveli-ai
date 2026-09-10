import {describe,it,expect} from 'vitest';
import {planTravelMetadata,scheduledDateArrival,calderDateMatchesCharacter} from './calders-reservations';
describe('saved Calder travel reservations',()=>{
  it('keeps a named companion’s outing with that companion',()=>{
    expect(calderDateMatchesCharacter({eligibleTemplateIds:['bess']},'bess')).toBe(true);
    expect(calderDateMatchesCharacter({eligibleTemplateIds:['bess']},'sabine')).toBe(false);
    expect(calderDateMatchesCharacter({eligibleTemplateIds:[]},'sabine')).toBe(true);
  });
  it('replaces the old quote and preserves each group member’s different journey',()=>{
    const a={travelReservationStartsAt:'2026-09-09T11:30:00Z',travelReservationEndsAt:'2026-09-09T13:30:00Z'},b={travelReservationStartsAt:'2026-09-09T11:10:00Z',travelReservationEndsAt:'2026-09-09T13:50:00Z'};
    expect(planTravelMetadata({note:'keep',travelReservationStartsAt:'old',travelReservationsByParticipant:{removed:a}},'a',{a,b})).toEqual({note:'keep',...a,travelReservationsByParticipant:{a,b}});
    expect(planTravelMetadata({...a,note:'keep',travelReservationsByParticipant:{a}},'a',{a:{}})).toEqual({note:'keep'});
  });
  it('keeps the original end and return journey when a scheduled date starts late',()=>{
    const block=(id:string,start:string,end:string,locationId:string|null)=>({metadata:{reservationId:id},startsAt:`2026-09-09T${start}:00Z`,endsAt:`2026-09-09T${end}:00Z`,locationId});
    const blocks=[block('date:inbound','11:30','12:00',null),block('date','12:00','13:30','cafe'),block('date:outbound','13:30','14:00',null),block('date-other','09:00','18:00','cafe')];
    expect(scheduledDateArrival(blocks,'date','cafe',new Date('2026-09-09T12:20:00Z'))).toEqual({travelReservationStartsAt:'2026-09-09T11:30:00.000Z',travelReservationEndsAt:'2026-09-09T14:00:00.000Z',reservedDateEndsAt:'2026-09-09T13:30:00Z'});
    expect(scheduledDateArrival(blocks,'date','cafe',new Date('2026-09-09T13:30:00Z'))).toBeNull();
    expect(scheduledDateArrival(blocks,'date','other',new Date('2026-09-09T12:20:00Z'))).toBeNull();
  });
});
