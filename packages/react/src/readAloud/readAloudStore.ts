import type { ISpeechSession, ISpeechState, TtsPhase } from "@saystack/core";

import type { ISpeechApi, ISpeechHookResult } from "../useSpeech.js";

export type ReadAloudId = string | number;

export interface IReadAloudSnapshot<TAnchor> {
  speech: ISpeechHookResult;
  messageId: ReadAloudId | null;
  isSummary: boolean;
  anchor: TAnchor | null;
}

export interface IReadAloudView {
  phase: TtsPhase;
  isSummary: boolean;
  speech: ISpeechHookResult;
}

export interface IReadAloudStore<TAnchor> {
  readonly api: ISpeechApi;
  readonly readLevels: () => ArrayLike<number> | undefined;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => IReadAloudSnapshot<TAnchor>;
  viewOf: (id: ReadAloudId) => IReadAloudView;
  speak: (id: ReadAloudId, markdown: string) => void;
  register: (id: ReadAloudId, anchor: TAnchor) => () => void;
  speakingId: () => ReadAloudId | null;
  markSummary: (id: ReadAloudId, isSummary: boolean) => void;
  connect: () => () => void;
}

const IDLE_STATE: ISpeechState = { phase: "idle", text: "", errorCode: null, errorMessage: null, chunks: [], chunkIndex: -1 };

// Replies that are not being read share one idle view, so they do not re-render while another one plays.
export function createReadAloudStore<TAnchor>(
  session: ISpeechSession,
  api: ISpeechApi,
  readLevels: () => ArrayLike<number> | undefined,
): IReadAloudStore<TAnchor> {
  const listeners = new Set<() => void>();
  const anchors = new Map<ReadAloudId, TAnchor>();
  const idle: IReadAloudView = { phase: "idle", isSummary: false, speech: [IDLE_STATE, api] };
  let messageId: ReadAloudId | null = null;
  let summaryId: ReadAloudId | null = null;

  const build = (): IReadAloudSnapshot<TAnchor> => ({
    speech: [session.state, api],
    messageId,
    isSummary: summaryId !== null && summaryId === messageId,
    anchor: messageId === null ? null : (anchors.get(messageId) ?? null),
  });

  let snapshot = build();
  let reading: IReadAloudView = idle;

  const refresh = (): void => {
    snapshot = build();
    reading = { phase: session.state.phase, isSummary: snapshot.isSummary, speech: snapshot.speech };

    for (const listener of listeners) {
      listener();
    }
  };

  return {
    api,
    readLevels,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    viewOf: (id) => (id === messageId ? reading : idle),
    speak: (id, markdown) => {
      if (id === messageId && markdown === session.state.text) {
        api.replay();
        return;
      }

      messageId = id;
      summaryId = null;
      refresh();
      void api.speak(markdown);
    },
    register: (id, anchor) => {
      if (anchors.get(id) !== anchor) {
        anchors.set(id, anchor);

        if (id === messageId) {
          refresh();
        }
      }

      return () => {
        if (anchors.get(id) !== anchor) {
          return;
        }

        anchors.delete(id);

        if (id === messageId) {
          refresh();
        }
      };
    },
    speakingId: () => messageId,
    markSummary: (id, isSummary) => {
      if (id !== messageId) {
        return;
      }

      summaryId = isSummary ? id : null;
      refresh();
    },
    connect: () => {
      const unsubscribe = session.subscribe(refresh);

      return () => {
        unsubscribe();
        session.stop();
      };
    },
  };
}
