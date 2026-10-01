import { speechChunks, toSpeechText } from "@saystack/core";

import { DEMO_DICTATION, SPOKEN_REPLIES } from "../src/content.ts";

const replies = SPOKEN_REPLIES.flatMap((markdown) => speechChunks(toSpeechText(markdown)));

process.stdout.write(`${JSON.stringify({ replies, dictation: DEMO_DICTATION }, null, 2)}\n`);
