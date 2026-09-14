/** Serialize event bursts; remember invalidations received during an active read. */
export function coalescedRefresh(refresh: () => Promise<void>, delayMs = 180) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false, dirty = false, disposed = false;
  const schedule = () => {
    if (disposed) return;
    dirty = true;
    if (running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void run(); }, delayMs);
  };
  const run = async () => {
    if (disposed) return;
    running = true; dirty = false;
    try { await refresh(); }
    catch { /* The next event or focus refresh can retry. */ }
    finally { running = false; if (dirty && !disposed) schedule(); }
  };
  return { schedule, dispose() { disposed = true; if (timer) clearTimeout(timer); } };
}
