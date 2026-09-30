import type { Context } from "hono";

import type { IAudioReadResult } from "./types.js";

export async function readAudioInput(c: Context, maxBodyBytes: number): Promise<IAudioReadResult> {
  const contentType = c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";

  const declaredLength = Number(c.req.header("content-length") ?? "0");

  if (declaredLength > maxBodyBytes) {
    return {
      ok: false,
      errorCode: "AUDIO_TOO_LARGE",
      message: `content-length ${declaredLength} exceeds limit ${maxBodyBytes}`,
    };
  }

  if (contentType.startsWith("multipart/form-data")) {
    return readMultipart(c);
  }

  if (contentType === "" || contentType.startsWith("audio/") || contentType === "application/octet-stream") {
    const buffer = await c.req.arrayBuffer();
    const audio = new Uint8Array(buffer);
    const mimeType = contentType === "" ? undefined : contentType;
    const filename = c.req.header("x-audio-filename");

    return {
      ok: true,
      audio,
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(filename !== undefined ? { filename } : {}),
    };
  }

  return { ok: false, errorCode: "UNSUPPORTED_MEDIA", message: `unsupported content-type '${contentType}'` };
}

async function readMultipart(c: Context): Promise<IAudioReadResult> {
  let form: FormData;

  try {
    form = await c.req.formData();
  } catch {
    return { ok: false, errorCode: "ENGINE_REJECTED_INPUT", message: "malformed multipart body" };
  }

  const file = form.get("file");

  if (file === null) {
    return { ok: false, errorCode: "EMPTY_AUDIO", message: "missing 'file' field" };
  }

  if (!(file instanceof Blob)) {
    return { ok: false, errorCode: "UNSUPPORTED_MEDIA", message: "'file' field must be binary" };
  }

  const audio = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type === "" ? undefined : file.type;
  const rawName = (file as { name?: unknown }).name;
  const filename = typeof rawName === "string" && rawName.length > 0 ? rawName : undefined;
  const prompt = form.get("prompt");

  return {
    ok: true,
    audio,
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(filename !== undefined ? { filename } : {}),
    ...(typeof prompt === "string" && prompt.length > 0 ? { prompt } : {}),
  };
}