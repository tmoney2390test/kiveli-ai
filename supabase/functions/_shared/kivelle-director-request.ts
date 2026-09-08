/** One abortable deadline covers connection and the complete response body. */
export async function directorRequest(url: string, init: RequestInit, timeoutMs: number, fetchImpl: typeof fetch = fetch): Promise<{ response: Response; data: Record<string, any> }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...init, signal: controller.signal });
        const data = await response.json();
        return { response, data };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('director_timeout'));
        }, Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
