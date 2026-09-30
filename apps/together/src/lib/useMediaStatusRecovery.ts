import { useEffect, useRef, useState } from 'react';
import type { GeneratedMedia, MediaOffer } from '../types';
import { manageMedia } from './api';
import { newestMedia, mediaProgressPresentation } from './mediaProgressPresentation';
import { checkExistingMediaRequest } from './mediaStatusRecovery';
import { useTogether } from '../store/useTogether';

export function useMediaStatusRecovery(sourceMedia?: GeneratedMedia, sourceOffer?: MediaOffer | null) {
  const [checked, setChecked] = useState<{ key: string; media?: GeneratedMedia; offer?: MediaOffer }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now);
  const inFlight = useRef(false);
  const key = sourceOffer?.id ?? sourceMedia?.id ?? '';
  const activeKey = useRef(key); activeKey.current = key;
  useEffect(() => { activeKey.current = key; return () => { activeKey.current = ''; }; }, [key]);
  useEffect(() => { if (sourceOffer?.preview_metadata?.acceptQueued) setChecked(undefined); }, [sourceOffer?.preview_metadata?.acceptQueued]);
  const local = checked?.key === key ? checked : undefined;
  const media = newestMedia(sourceMedia, local?.media);
  const offer = local?.offer && (!sourceOffer || Date.parse(local.offer.updated_at) >= Date.parse(sourceOffer.updated_at)) ? local.offer : sourceOffer ?? undefined;
  const pending = media ? media.status === 'queued' || media.status === 'generating' || media.status === 'ready' && !media.signed_url
    : offer?.status === 'accepted' || offer?.preview_metadata?.acceptQueued === true;
  useEffect(() => { setNotice(''); }, [key]);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [pending]);
  const check = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice('');
    try {
      const result = await checkExistingMediaRequest({ mediaId: media?.id, offerId: offer?.id }, manageMedia);
      if (activeKey.current !== key) return;
      setChecked({ key, media: result.media ?? undefined, offer: result.offer });
      if (result.media) useTogether.getState().upsertMedia(result.media);
      setNow(Date.now());
      setNotice(result.media?.status === 'ready' && result.media.signed_url ? ''
        : result.offer?.status === 'pending' ? 'Not started yet. Confirm this photo when you’re ready.'
        : result.media?.status === 'failed' ? 'Status updated. Choose a recovery option below.'
        : 'Status checked. We’re still working on this request.');
    } catch (error) {
      if (activeKey.current !== key) return;
      const code = (error as { code?: string })?.code;
      setNotice(code === 'NOT_FOUND' ? 'This request is no longer available. Contact support if you need help finding it.'
        : 'Couldn’t check right now. Reconnect and check again; this won’t start or charge for another photo.');
    } finally { inFlight.current = false; if (activeKey.current === key) setBusy(false); }
  };
  return { media, offer, busy, notice, check, progress: mediaProgressPresentation(media, offer, now) };
}
