/** Keep speculative downloads off metered/very slow browser connections. */
export function canWarmMedia(
  network?: { online?: boolean; saveData?: boolean; effectiveType?: string },
) {
  return network?.online !== false && network?.saveData !== true &&
    !['slow-2g', '2g'].includes(network?.effectiveType ?? '');
}

export function browserAllowsMediaWarmup() {
  if (typeof navigator === 'undefined') return true;
  const connection =
    (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection;
  return canWarmMedia({
    online: navigator.onLine,
    saveData: connection?.saveData,
    effectiveType: connection?.effectiveType,
  });
}
