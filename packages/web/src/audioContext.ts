let shared: AudioContext | null = null;

export function sharedAudioContext(): AudioContext {
  if (shared === null) {
    shared = new AudioContext();
  }

  return shared;
}

export function unlockWebAudio(context?: AudioContext): void {
  if (context === undefined && typeof AudioContext === "undefined") {
    return;
  }

  const target = context ?? sharedAudioContext();

  if (target.state === "suspended") {
    void target.resume();
  }
}
