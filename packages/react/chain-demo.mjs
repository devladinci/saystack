import { readFile, writeFile } from "node:fs/promises";
import { createOmlxSttAdapter, createLlmNormalizer, createOmlxTtsAdapter } from "@saystack/engine-openai-compatible";
import { toSpeechText } from "@saystack/core";

const settings = JSON.parse(await readFile(process.env.HOME + "/.omlx/settings.json", "utf8"));
const token = settings.auth?.api_key;
if (!token) throw new Error("no token in ~/.omlx/settings.json");
const base = "http://127.0.0.1:7777/v1";

const stt = createOmlxSttAdapter({ url: base, token });
const llm = createLlmNormalizer({ url: base, token, model: "gemma-4-26B-A4B-it-QAT-MLX-4bit", disableThinking: true });
const tts = createOmlxTtsAdapter({ url: base, token });

const wav = await readFile("/tmp/chain-input.wav");

console.log("STEP 1 — STT (parakeet)");
const t0 = Date.now();
const heard = await stt.transcribe({ audio: new Uint8Array(wav), filename: "input.wav", mimeType: "audio/wav" });
console.log(`   ${Date.now() - t0} ms · ok=${heard.ok}`);
if (!heard.ok) throw new Error("STT failed: " + heard.errorCode + " — " + heard.message);
console.log("   heard: " + JSON.stringify(heard.text));

console.log("STEP 2 — Transform (gemma-4, thinking off)");
const t1 = Date.now();
const spoken = await llm(heard.text, ["en", "bg"]);
console.log(`   ${Date.now() - t1} ms · ok=${spoken.ok} · lang=${spoken.ok ? spoken.language : "?"}`);
if (!spoken.ok) throw new Error("normalize failed: " + spoken.errorCode + " — " + spoken.message);
console.log("   BEFORE (raw STT text):");
console.log("     " + heard.text);
console.log("   AFTER  (what will be spoken):");
console.log("     " + spoken.normalizedText);
console.log("   language picked: " + spoken.language);

console.log("STEP 3 — TTS (higgs)");
const t2 = Date.now();
const speechInput = toSpeechText(spoken.normalizedText);
const audio = await tts.synthesize({ text: speechInput });
console.log(`   ${Date.now() - t2} ms · ok=${audio.ok} · ${(audio.ok ? audio.audio.byteLength : 0)} bytes wav`);
if (!audio.ok) throw new Error("TTS failed: " + audio.errorCode + " — " + audio.message);

await writeFile("/tmp/chain-output.wav", Buffer.from(audio.audio));
console.log("DONE — /tmp/chain-output.wav");
