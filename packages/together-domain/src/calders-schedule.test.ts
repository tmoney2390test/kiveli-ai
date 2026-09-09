import {describe,it,expect} from 'vitest';
import {reserveCalderEvent,resolveCalderPresence,type CalderInterval,type CalderLocation} from './calders-schedule';
const locations:CalderLocation[]=[{id:'west',districtId:'w'},{id:'east',districtId:'e'},{id:'home',districtId:'w',home:true,ownerId:'gin'},{id:'crowcut',districtId:'w',requiredState:'crowcut.access_granted'}];
const travel={districtOrder:['main-street','the-railhead'],districtSlugs:{w:'main-street',e:'the-railhead'},ordinaryMinutes:[[8,35],[35,10]]};
const baseline:CalderInterval[]=[{id:'work',start:0,end:1440,locationId:'west',activity:'Work',kind:'baseline',priority:1}];
const event={id:'meeting',start:600,end:660,locationId:'east',activity:'A meeting',kind:'event' as const};
describe('Calder’s Run reservations',()=>{
  it('cannot create an outing without a known origin and return destination',()=>{
    expect(reserveCalderEvent({intervals:[],reservation:event,locations,travel}).accepted).toBe(false);
    expect(reserveCalderEvent({intervals:[{...baseline[0]!,end:550}],reservation:event,locations,travel}).accepted).toBe(false);
  });
  it('rejects reversed and non-finite times without changing the schedule',()=>{
    for(const start of [700,NaN])expect(reserveCalderEvent({intervals:baseline,reservation:{...event,start},locations,travel})).toMatchObject({accepted:false,intervals:baseline});
  });
  it('reserves cross-river travel and splits the baseline without losing the rest of the day',()=>{
    const r=reserveCalderEvent({intervals:baseline,reservation:event,locations,travel});
    expect(r.accepted).toBe(true);
    expect(r.intervals.map(i=>[i.start,i.end,i.kind])).toEqual([[0,565,'baseline'],[565,600,'travel'],[600,660,'event'],[660,695,'travel'],[695,1440,'baseline']]);
    expect(resolveCalderPresence(r.intervals,599)?.locationId).toBeNull();
    expect(resolveCalderPresence(r.intervals,600)?.locationId).toBe('east');
  });
  it('keeps an accepted appointment and its travel ahead of a conflicting event',()=>{
    const appointment=reserveCalderEvent({intervals:baseline,reservation:{...event,kind:'appointment'},locations,travel});
    const other=reserveCalderEvent({intervals:appointment.intervals,reservation:{...event,id:'other',start:680,end:710},locations,travel});
    expect(other.accepted).toBe(false);expect(other.intervals).toEqual(appointment.intervals);
  });
  it('preserves baseline when the ferry is closed or severe weather prevents travel',()=>{
    for(const flags of [['ferry.closed'],['weather.severe']])expect(reserveCalderEvent({intervals:baseline,reservation:event,locations,travel,flags})).toMatchObject({accepted:false,intervals:baseline});
  });
  it('requires a particular home invitation, separate from familiarity or another home invitation',()=>{
    for(const flags of [[],['home.invited:someone-else']])expect(reserveCalderEvent({intervals:baseline,reservation:{...event,locationId:'home'},locations,travel,flags}).accepted).toBe(false);
    expect(reserveCalderEvent({intervals:baseline,reservation:{...event,locationId:'home'},locations,travel,flags:['home.invited:home']}).accepted).toBe(true);
  });
  it('does not reveal or travel to Crowcut without saved access',()=>{
    expect(reserveCalderEvent({intervals:baseline,reservation:{...event,locationId:'crowcut'},locations,travel}).accepted).toBe(false);
  });
});
