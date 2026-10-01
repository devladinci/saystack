import type { IPlatformRecorder, IWebRecording } from "@saystack/core";

export interface IWebRecorderOptions {
  mimeType?: string;
  constraints?: MediaTrackConstraints;
}

const VOICE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function createWebRecorder({
  mimeType,
  constraints = VOICE_CONSTRAINTS,
}: IWebRecorderOptions = {}): IPlatformRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let parts: Blob[] = [];
  let opening: Promise<void> | null = null;

  const release = (): void => {
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }

    stream = null;
    recorder = null;
  };

  const collect = (media: MediaRecorder): IWebRecording => {
    const blob = new Blob(parts, { type: media.mimeType || "audio/webm" });
    parts = [];
    release();

    return { blob };
  };

  const open = async (): Promise<void> => {
    release();
    const next = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    let media: MediaRecorder;

    try {
      media = new MediaRecorder(next, mimeType === undefined ? undefined : { mimeType });
    } catch (error: unknown) {
      for (const track of next.getTracks()) {
        track.stop();
      }

      throw error;
    }

    parts = [];
    media.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        parts.push(event.data);
      }
    });
    stream = next;
    recorder = media;
    media.start();
  };

  return {
    get stream() {
      return stream;
    },

    startRecording() {
      const attempt = open();
      opening = attempt;

      const settle = (): void => {
        if (opening === attempt) {
          opening = null;
        }
      };

      attempt.then(settle, settle);

      return attempt;
    },

    async stopRecording() {
      if (opening !== null) {
        await opening.catch(() => undefined);
      }

      const media = recorder;

      if (media === null) {
        throw new DOMException("nothing is being recorded", "InvalidStateError");
      }

      if (media.state === "inactive") {
        return collect(media);
      }

      return new Promise<IWebRecording>((resolve) => {
        media.addEventListener("stop", () => resolve(collect(media)), { once: true });
        media.stop();
      });
    },
  };
}
