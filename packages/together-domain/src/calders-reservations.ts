type TravelReservation = {travelReservationStartsAt?:string;travelReservationEndsAt?:string};

export function calderDateMatchesCharacter(metadata:Record<string,unknown>|null|undefined,characterTemplateId:string) {
  const eligible=metadata?.['eligibleTemplateIds'];
  return !Array.isArray(eligible)||eligible.length===0||eligible.includes(characterTemplateId);
}

/** Replace stale travel quotes whenever a plan's time, place or roster changes. */
export function planTravelMetadata(previous:Record<string,unknown>,leaderId:string,reservations:Record<string,TravelReservation>) {
  const metadata=Object.fromEntries(Object.entries(previous).filter(([key])=>!['travelReservationStartsAt','travelReservationEndsAt','travelReservationsByParticipant'].includes(key)));
  const entries=Object.entries(reservations).filter(([,r])=>r.travelReservationStartsAt&&r.travelReservationEndsAt);
  if(!entries.length)return metadata;
  return {...metadata,...reservations[leaderId],travelReservationsByParticipant:Object.fromEntries(entries)};
}

/** Late arrival uses the original scene deadline and keeps both reserved journeys. */
export function scheduledDateArrival(blocks:Array<{startsAt:string;endsAt:string;locationId?:string|null;metadata?:Record<string,unknown>}>,dateId:string,locationId:string,now:Date) {
  const arrival=blocks.find(b=>b.metadata?.['reservationId']===dateId&&b.locationId===locationId&&Date.parse(b.startsAt)<=now.getTime()&&Date.parse(b.endsAt)>now.getTime());
  if(!arrival)return null;
  const reserved=blocks.filter(b=>{const id=b.metadata?.['reservationId'];return typeof id==='string'&&[dateId,`${dateId}:inbound`,`${dateId}:outbound`].includes(id);});
  return {travelReservationStartsAt:new Date(Math.min(...reserved.map(b=>Date.parse(b.startsAt)))).toISOString(),travelReservationEndsAt:new Date(Math.max(...reserved.map(b=>Date.parse(b.endsAt)))).toISOString(),reservedDateEndsAt:arrival.endsAt};
}

