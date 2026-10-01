import { ReadAloudProvider } from "@saystack/react-web";
import { useEffect, useRef, useState } from "react";

import { createClipSynthesize } from "./clips.js";
import { Playground } from "./Playground.js";
import { effectiveStyle } from "./settings.js";
import { useBackground } from "./useBackground.js";
import { useSettings } from "./useSettings.js";

export function App() {
  const { settings, update, reset } = useSettings();
  const background = useBackground(settings.theme);
  const latencyRef = useRef(settings.hasLatency);
  const [synthesize] = useState(() => createClipSynthesize(() => latencyRef.current));

  useEffect(() => {
    latencyRef.current = settings.hasLatency;
  });

  return (
    <ReadAloudProvider
      synthesize={synthesize}
      bands={effectiveStyle("readAloud", settings.readAloud, background).bands}
    >
      <Playground settings={settings} background={background} onChange={update} onReset={reset} />
    </ReadAloudProvider>
  );
}
