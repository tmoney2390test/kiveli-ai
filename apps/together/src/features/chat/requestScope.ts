export type ChatRequestLease = {
  isCurrent: () => boolean;
  release: () => void;
};

/** Owns asynchronous work for one mounted account/Life/conversation. */
export function createChatRequestScope() {
  let active = true;
  let generation = 0;
  const lanes = new Map<string, symbol>();
  const capture = () => {
    const startedIn = generation;
    return () => active && startedIn === generation;
  };
  return {
    capture,
    activate() {
      active = true;
    },
    dispose() {
      active = false;
      generation += 1;
      lanes.clear();
    },
    start(lane: string, replace = false): ChatRequestLease | null {
      if (!active || (!replace && lanes.has(lane))) return null;
      const owner = Symbol(lane);
      const isActive = capture();
      lanes.set(lane, owner);
      return {
        isCurrent: () => isActive() && lanes.get(lane) === owner,
        release() {
          if (lanes.get(lane) === owner) lanes.delete(lane);
        },
      };
    },
  };
}

export type ChatRequestScope = ReturnType<typeof createChatRequestScope>;
