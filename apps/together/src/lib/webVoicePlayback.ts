type PlayableAudio = Pick<HTMLAudioElement, 'ended' | 'currentTime' | 'play'>;

export async function playBrowserVoice(audio: PlayableAudio): Promise<boolean> {
  if (audio.ended) audio.currentTime = 0;
  try {
    // play() must run synchronously from the tap, before awaiting anything.
    await audio.play();
    return true;
  } catch {
    return false;
  }
}
