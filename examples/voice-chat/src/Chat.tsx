import { ReadAloudAura, ReadAloudPlayer, useReadAloud } from "@saystack/react-web";
import { useState } from "react";

import { askChat } from "./chatApi.js";
import type { IChatMessage } from "./ChatMessage.js";
import { ChatMessage } from "./ChatMessage.js";
import { Composer } from "./Composer.js";

const WELCOME: IChatMessage = {
  id: "welcome",
  role: "assistant",
  text: [
    "Hi. Press **Read aloud** under any reply to hear it, or press **Mic** to dictate a message.",
    "",
    "While a reply is read, the word being spoken is highlighted and the glow around the message follows the voice.",
    "",
    "| Part | What it does |",
    "|---|---|",
    "| Aura | Shows the voice as light |",
    "| Player | Pause, skip and replay |",
    "",
    "Long replies with tables or code are first rewritten for speech, so the table above is described rather than read cell by cell.",
  ].join("\n"),
};

export function Chat() {
  const [messages, setMessages] = useState<IChatMessage[]>([WELCOME]);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isAutoRead, setIsAutoRead] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const { speak } = useReadAloud();

  const handleSend = async (text: string): Promise<void> => {
    const question: IChatMessage = { id: crypto.randomUUID(), role: "user", text };
    const history = [...messages, question];
    setMessages(history);
    setNotice(null);
    setIsWaiting(true);

    const reply = await askChat(history.map((message) => ({ role: message.role, content: message.text })));
    setIsWaiting(false);

    if (!reply.ok) {
      setNotice(reply.message);
      return;
    }

    const answer: IChatMessage = { id: crypto.randomUUID(), role: "assistant", text: reply.text };
    setMessages((previous) => [...previous, answer]);

    if (isAutoRead) {
      speak(answer.id, answer.text);
    }
  };

  const handleAutoRead = (): void => {
    setIsAutoRead((previous) => !previous);
  };

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">saystack</h1>
        <label className="app__toggle">
          <input type="checkbox" checked={isAutoRead} onChange={handleAutoRead} />
          Read replies aloud
        </label>
      </header>
      <div ref={setScroller} className="app__thread">
        <ReadAloudAura clip={scroller} />
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {isWaiting && <p className="app__waiting">Thinking…</p>}
        {notice !== null && <p className="app__notice">{notice}</p>}
      </div>
      <footer className="app__dock">
        <ReadAloudPlayer />
        <Composer isWaiting={isWaiting} onSend={handleSend} />
      </footer>
    </main>
  );
}
