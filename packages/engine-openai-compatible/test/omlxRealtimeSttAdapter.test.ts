import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import type { AddressInfo } from "node:net";
import { createOmlxRealtimeSttAdapter } from "../src/omlxRealtimeSttAdapter.js";

const TOKEN = "test-token";
const BASE = "http://127.0.0.1:7777/v1";

interface IWsHarness {
  url: string;
  server: WebSocketServer;
  close(): Promise<void>;
}

const wssOf = (harness: IWsHarness): WebSocketServer => harness.server;

async function startWsServer(handle: (ws: WsSocket) => void): Promise<IWsHarness> {
  const wss = new WebSocketServer({ port: 0 });
  wss.on("connection", handle);
  await new Promise<void>((resolve) => wss.on("listening", resolve));
  const addr = wss.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}/v1`,
    server: wss,
    close: () =>
      new Promise((resolve) => {
        wss.close(() => resolve());
      }),
  };
}

const makePcm16 = (fill: number, samples: number): Uint8Array => {
  const bytes = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    bytes[i * 2] = fill;
    bytes[i * 2 + 1] = 0;
  }
  return bytes;
};

describe("createOmlxRealtimeSttAdapter (fake ws server)", () => {
  let harness: IWsHarness | null = null;

  afterEach(async () => {
    if (harness) {
      await harness.close();
      harness = null;
    }
  });

  it("capabilities: streaming and interim, no word timings", () => {
    const adapter = createOmlxRealtimeSttAdapter({ url: BASE, token: TOKEN });

    expect(adapter.capabilities.streaming).toBe(true);
    expect(adapter.capabilities.interimResults).toBe(true);
    expect(adapter.capabilities.wordTimings).toBe(false);
  });

  it("handshake sends one start message with in-band key, then ready", async () => {
    const seen: string[] = [];
    harness = await startWsServer((ws) => {
      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        seen.push(data.toString());
        ws.send(JSON.stringify({ type: "ready" }));
      });
    });

    const adapter = createOmlxRealtimeSttAdapter({ url: harness.url, token: TOKEN });
    const result = await adapter.openRealtime({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const start = JSON.parse(seen[0] ?? "{}") as { type?: string; api_key?: string; model?: string };
    expect(seen.length).toBe(1);
    expect(start.type).toBe("start");
    expect(start.api_key).toBe(TOKEN);
    expect(typeof start.model).toBe("string");
    result.session.release();
  });

  it("deltas surface through onDelta, stop() settles the session", async () => {
    let acc = "";
    harness = await startWsServer((ws) => {
      ws.on("message", (data, isBinary) => {
        if (!isBinary) {
          const payload = JSON.parse(data.toString()) as { type?: string };
          if (payload.type === "stop") {
            ws.send(JSON.stringify({ type: "transcript.done", text: acc }));
            ws.close(1000);
            return;
          }
          ws.send(JSON.stringify({ type: "ready" }));
          return;
        }
        acc += "Hello ";
        ws.send(JSON.stringify({ type: "transcript.delta", delta: "Hello " }));
      });
    });

    const adapter = createOmlxRealtimeSttAdapter({ url: harness.url, token: TOKEN });
    const open = await adapter.openRealtime({});
    expect(open.ok).toBe(true);
    if (!open.ok) return;

    const deltas: string[] = [];
    open.session.onDelta((delta) => deltas.push(delta));
    open.session.feedPcm16(makePcm16(7, 160));
    await new Promise((r) => setTimeout(r, 80));
    const final = await open.session.stop();

    expect(final.ok).toBe(true);
    if (final.ok) expect(final.text).toBe("Hello ");
    open.session.release();
  });

  it("start rejection 'Invalid API key' maps to BAD_TOKEN", async () => {
    harness = await startWsServer((ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({ type: "error", detail: "Invalid API key" }));
        ws.close(1008);
      });
    });

    const adapter = createOmlxRealtimeSttAdapter({ url: harness.url, token: "wrong" });
    const result = await adapter.openRealtime({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("BAD_TOKEN");
  });

  it("no-realtime-support rejection maps to MODEL_NOT_FOUND with detail kept", async () => {
    harness = await startWsServer((ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({ type: "error", detail: "Model 'x' does not support realtime transcription." }));
        ws.close(1008);
      });
    });

    const adapter = createOmlxRealtimeSttAdapter({ url: harness.url, token: TOKEN });
    const result = await adapter.openRealtime({ model: "parakeet-tdt-0.6b-v3" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("MODEL_NOT_FOUND");
    expect(result.message).toContain("realtime");
  });

  it("unreachable server maps to ENGINE_UNAVAILABLE", async () => {
    const adapter = createOmlxRealtimeSttAdapter({ url: "http://127.0.0.1:9/v1", token: TOKEN });
    const result = await adapter.openRealtime({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("ENGINE_UNAVAILABLE");
  });

  const readyServer = (onMessage: (ws: WsSocket, data: Buffer, isBinary: boolean) => void) =>
    startWsServer((ws) => {
      ws.on("message", (data: Buffer, isBinary: boolean) => {
        if (!isBinary && (JSON.parse(data.toString()) as { type?: string }).type === "start") {
          ws.send(JSON.stringify({ type: "ready" }));
          return;
        }
        onMessage(ws, data, isBinary);
      });
    });

  it("an engine error after ready fails the stream instead of ending it quietly", async () => {
    harness = await readyServer((ws, _data, isBinary) => {
      if (isBinary) {
        ws.send(JSON.stringify({ type: "error", detail: "decoder crashed" }));
        ws.close(1011);
      }
    });
    const open = await createOmlxRealtimeSttAdapter({ url: harness.url, token: TOKEN }).openRealtime({});
    if (!open.ok) throw new Error("expected the stream to open");
    const errors: string[] = [];
    open.session.onError((code, message) => errors.push(`${code}: ${message ?? ""}`));

    open.session.feedPcm16(makePcm16(1, 160));
    const final = await open.session.stop();

    expect(errors).toEqual(["ENGINE_REJECTED_INPUT: decoder crashed"]);
    expect(final.ok).toBe(false);
  });

  it("a stream that closes before the transcript is done is not a success", async () => {
    harness = await readyServer((ws, _data, isBinary) => {
      if (isBinary) {
        ws.send(JSON.stringify({ type: "transcript.delta", delta: " Half a" }));
        ws.close(1011);
      }
    });
    const open = await createOmlxRealtimeSttAdapter({ url: harness.url, token: TOKEN }).openRealtime({});
    if (!open.ok) throw new Error("expected the stream to open");
    const deltas: string[] = [];
    open.session.onDelta((_delta, full) => deltas.push(full));

    open.session.feedPcm16(makePcm16(1, 160));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const final = await open.session.stop();

    expect(deltas).toEqual([" Half a"]);
    expect(final).toMatchObject({ ok: false, errorCode: "ENGINE_UNAVAILABLE" });
  });

  it("gives up on the last words after the stop timeout", async () => {
    harness = await readyServer(() => {});
    const open = await createOmlxRealtimeSttAdapter({ url: harness.url, token: TOKEN }, { stopTimeoutMs: 30 }).openRealtime({});
    if (!open.ok) throw new Error("expected the stream to open");

    await expect(open.session.stop()).resolves.toMatchObject({ ok: false, errorCode: "TIMEOUT" });
  });

  it("release settles a pending stop and closes the socket", async () => {
    let isClosed = false;
    harness = await readyServer(() => {});
    wssOf(harness).on("connection", (ws) => ws.on("close", () => (isClosed = true)));
    const open = await createOmlxRealtimeSttAdapter({ url: harness.url, token: TOKEN }).openRealtime({});
    if (!open.ok) throw new Error("expected the stream to open");

    const final = open.session.stop();
    open.session.release();

    await expect(final).resolves.toMatchObject({ ok: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(isClosed).toBe(true);
  });
});

