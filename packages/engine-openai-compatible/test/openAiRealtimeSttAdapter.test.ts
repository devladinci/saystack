import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import type { AddressInfo } from "node:net";
import type { IncomingMessage } from "node:http";
import { createOpenAiRealtimeSttAdapter } from "../src/openAiRealtimeSttAdapter.js";

const TOKEN = "sk-test";
const MODEL = "gpt-4o-transcribe";

interface IEvent {
  type: string;
  [key: string]: unknown;
}

interface IFakeServer {
  url: string;
  events: IEvent[];
  requests: IncomingMessage[];
  close(): Promise<void>;
}

async function startFakeOpenAi(
  onEvent: (ws: WsSocket, event: IEvent) => void,
  { rejectStatus }: { rejectStatus?: number } = {},
): Promise<IFakeServer> {
  const events: IEvent[] = [];
  const requests: IncomingMessage[] = [];
  const wss = new WebSocketServer({
    port: 0,
    verifyClient: (_info, done) => (rejectStatus === undefined ? done(true) : done(false, rejectStatus)),
  });
  wss.on("connection", (ws, request) => {
    requests.push(request);
    ws.send(JSON.stringify({ type: "session.created" }));
    ws.on("message", (raw) => {
      const event = JSON.parse(raw.toString()) as IEvent;
      events.push(event);
      onEvent(ws, event);
    });
  });
  await new Promise<void>((resolve) => wss.on("listening", resolve));
  const { port } = wss.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/v1`,
    events,
    requests,
    close: () => new Promise((resolve) => wss.close(() => resolve())),
  };
}

// Answers like OpenAI: session.updated on session.update, deltas then .completed on commit.
const transcribing =
  (words: string[]) =>
  (ws: WsSocket, event: IEvent): void => {
    if (event.type === "session.update") {
      ws.send(JSON.stringify({ type: "session.updated" }));
    }
    if (event.type === "input_audio_buffer.commit") {
      for (const word of words) {
        ws.send(
          JSON.stringify({ type: "conversation.item.input_audio_transcription.delta", item_id: "i1", delta: word }),
        );
      }
      ws.send(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          item_id: "i1",
          transcript: words.join(""),
        }),
      );
    }
  };

const silence = (samples: number): Uint8Array => new Uint8Array(samples * 2);

describe("createOpenAiRealtimeSttAdapter (fake OpenAI server)", () => {
  let server: IFakeServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("opens a transcription session with the bearer token, 24 kHz pcm and no server VAD", async () => {
    server = await startFakeOpenAi(transcribing([]));
    const open = await createOpenAiRealtimeSttAdapter({ url: server.url, token: TOKEN, model: MODEL }).openRealtime({});

    expect(open.ok).toBe(true);
    expect(server.requests[0]?.url).toBe("/v1/realtime?intent=transcription");
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(server.events[0]).toEqual({
      type: "session.update",
      session: {
        type: "transcription",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: { model: MODEL },
            turn_detection: null,
          },
        },
      },
    });
    if (open.ok) open.session.release();
  });

  it("sends a language hint as `language` to older models and as `languages` to gpt-live-transcribe", async () => {
    server = await startFakeOpenAi(transcribing([]));
    const older = await createOpenAiRealtimeSttAdapter({ url: server.url, model: MODEL }).openRealtime({
      language: "bg",
    });
    const live = await createOpenAiRealtimeSttAdapter(
      { url: server.url },
      { model: "gpt-live-transcribe" },
    ).openRealtime({
      language: "bg",
    });

    const transcriptions = server.events.map(
      (event) => (event.session as { audio: { input: { transcription: unknown } } }).audio.input.transcription,
    );
    expect(transcriptions).toEqual([
      { model: MODEL, language: "bg" },
      { model: "gpt-live-transcribe", languages: ["bg"] },
    ]);
    if (older.ok) older.session.release();
    if (live.ok) live.session.release();
  });

  it("resamples the 16 kHz stream to 24 kHz base64 appends", async () => {
    server = await startFakeOpenAi(transcribing(["hi"]));
    const open = await createOpenAiRealtimeSttAdapter({ url: server.url, model: MODEL }).openRealtime({});
    if (!open.ok) throw new Error("expected a session");

    for (let chunk = 0; chunk < 10; chunk += 1) {
      open.session.feedPcm16(silence(1600));
    }
    await open.session.stop();

    const appended = server.events
      .filter((event) => event.type === "input_audio_buffer.append")
      .reduce((total, event) => total + Buffer.from(String(event.audio), "base64").byteLength / 2, 0);
    expect(appended).toBeGreaterThanOrEqual(23_990);
    expect(appended).toBeLessThanOrEqual(24_000);
  });

  it("streams deltas and resolves stop with the completed transcript", async () => {
    server = await startFakeOpenAi(transcribing(["Hello,", " world."]));
    const open = await createOpenAiRealtimeSttAdapter({ url: server.url, model: MODEL }).openRealtime({});
    if (!open.ok) throw new Error("expected a session");
    const seen: string[] = [];
    open.session.onDelta((_delta, fullText) => seen.push(fullText));

    open.session.feedPcm16(silence(1600));
    const result = await open.session.stop();

    expect(seen).toEqual(["Hello,", "Hello, world."]);
    expect(result).toEqual({ ok: true, text: "Hello, world." });
    expect(server.events.at(-1)?.type).toBe("input_audio_buffer.commit");
  });

  it("stopping with nothing said is an empty transcript, not a failure", async () => {
    server = await startFakeOpenAi((ws, event) => {
      if (event.type === "session.update") ws.send(JSON.stringify({ type: "session.updated" }));
      if (event.type === "input_audio_buffer.commit") {
        ws.send(
          JSON.stringify({
            type: "error",
            error: { code: "input_audio_buffer_commit_empty", message: "buffer too small" },
          }),
        );
      }
    });
    const open = await createOpenAiRealtimeSttAdapter({ url: server.url, model: MODEL }).openRealtime({});
    if (!open.ok) throw new Error("expected a session");

    await expect(open.session.stop()).resolves.toEqual({ ok: true, text: "" });
  });

  it("a rejected session.update refuses the open with a coded error", async () => {
    server = await startFakeOpenAi((ws, event) => {
      if (event.type === "session.update") {
        ws.send(JSON.stringify({ type: "error", error: { code: "model_not_found", message: "no such model" } }));
      }
    });
    const open = await createOpenAiRealtimeSttAdapter({ url: server.url, model: "nope" }).openRealtime({});

    expect(open).toEqual({ ok: false, errorCode: "MODEL_NOT_FOUND", message: "no such model" });
  });

  it("a 401 on the upgrade is BAD_TOKEN, not an outage", async () => {
    server = await startFakeOpenAi(() => {}, { rejectStatus: 401 });
    const open = await createOpenAiRealtimeSttAdapter({ url: server.url, token: "wrong", model: MODEL }).openRealtime(
      {},
    );

    expect(open.ok).toBe(false);
    if (!open.ok) expect(open.errorCode).toBe("BAD_TOKEN");
  });

  it("a failed transcription settles stop with TRANSCRIPTION_FAILED", async () => {
    server = await startFakeOpenAi((ws, event) => {
      if (event.type === "session.update") ws.send(JSON.stringify({ type: "session.updated" }));
      if (event.type === "input_audio_buffer.commit") {
        ws.send(
          JSON.stringify({
            type: "conversation.item.input_audio_transcription.failed",
            error: { message: "could not decode" },
          }),
        );
      }
    });
    const open = await createOpenAiRealtimeSttAdapter({ url: server.url, model: MODEL }).openRealtime({});
    if (!open.ok) throw new Error("expected a session");

    await expect(open.session.stop()).resolves.toEqual({
      ok: false,
      errorCode: "TRANSCRIPTION_FAILED",
      message: "could not decode",
    });
  });

  it("no model anywhere refuses before connecting", async () => {
    const open = await createOpenAiRealtimeSttAdapter({ url: "http://127.0.0.1:9/v1" }).openRealtime({});

    expect(open).toEqual({
      ok: false,
      errorCode: "MODEL_NOT_FOUND",
      message: "no realtime transcription model is set",
    });
  });

  it("an unreachable server is ENGINE_UNAVAILABLE", async () => {
    const open = await createOpenAiRealtimeSttAdapter({ url: "http://127.0.0.1:9/v1", model: MODEL }).openRealtime({});

    expect(open.ok).toBe(false);
    if (!open.ok) expect(open.errorCode).toBe("ENGINE_UNAVAILABLE");
  });
});
