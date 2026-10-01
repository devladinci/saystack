import { ReadAloudProvider } from "@saystack/react-web";

import { Chat } from "./Chat.js";
import { rewriteForSpeech } from "./chatApi.js";

export function App() {
  return (
    <ReadAloudProvider endpoint="/voice/speech" rewrite={rewriteForSpeech}>
      <Chat />
    </ReadAloudProvider>
  );
}
