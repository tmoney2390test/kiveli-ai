import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { loadIosExplicitDialogueStatus } from '../lib/api/catalog';

/** iOS fails closed while the release control is unavailable or loading. */
export function useIosExplicitDialogueAvailability(visible: boolean): boolean {
  const [available, setAvailable] = useState(Platform.OS !== 'ios');
  useEffect(() => {
    if (Platform.OS !== 'ios' || !visible) return;
    let active = true;
    setAvailable(false);
    void loadIosExplicitDialogueStatus()
      .then((status) => { if (active) setAvailable(status.iosExplicitDialogueEnabled === true); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, [visible]);
  return available;
}
