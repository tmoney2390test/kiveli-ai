type InFlightSimulation = { promise: Promise<unknown>; startedAt: number };

const inFlight = new Map<string, InFlightSimulation>();
const lastCompletedAt = new Map<string, number>();

/** Coalesce home/chat life refreshes that mount together during navigation. */
export function coalesceSimulationRequest<T>(
  key: string,
  request: () => Promise<T>,
  options: { now?: number; cooldownMs?: number } = {},
): Promise<T | undefined> {
  const now=options.now??Date.now();
  const cooldownMs=options.cooldownMs??90_000;
  const active=inFlight.get(key);
  if(active)return active.promise as Promise<T>;
  const completedAt=lastCompletedAt.get(key)??0;
  if(now-completedAt<cooldownMs)return Promise.resolve(undefined);
  const promise=request().then((value)=>{
    lastCompletedAt.set(key,Date.now());
    return value;
  }).finally(()=>{
    if(inFlight.get(key)?.promise===promise)inFlight.delete(key);
  });
  inFlight.set(key,{promise,startedAt:now});
  return promise;
}

export function resetSimulationRequestCache(): void {
  inFlight.clear();
  lastCompletedAt.clear();
}
