export const CHAT_SCENE_RESOLVE_DEADLINE_MS = 8_000;

/** Scene discovery is optional to sending a message; it must not hold the composer indefinitely. */
export async function resolveSceneBeforeSend<T>(
  resolve: (signal: AbortSignal) => Promise<T>,
  timeoutMs = CHAT_SCENE_RESOLVE_DEADLINE_MS,
): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolve(controller.signal),
      new Promise<null>((finish) => {
        timer = setTimeout(() => {
          controller.abort();
          finish(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
