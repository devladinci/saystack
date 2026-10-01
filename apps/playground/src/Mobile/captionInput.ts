import type { IDictationInput } from "@saystack/core";

interface ICaptionHandlers {
  onCaption: (text: string) => void;
  onDrop: (text: string) => void;
}

export const DROP_MS = 340;

// Live words show in the middle of the screen; when dictation ends they drop into the draft.
export function createCaptionInput(field: IDictationInput, { onCaption, onDrop }: ICaptionHandlers): IDictationInput {
  let dropTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    show(text) {
      clearTimeout(dropTimer);
      onCaption(text);
    },
    end(text) {
      clearTimeout(dropTimer);

      if (text === null || text === "") {
        onCaption("");
        return;
      }

      onDrop(text);
      dropTimer = setTimeout(() => {
        field.end(text);
        onCaption("");
      }, DROP_MS);
    },
  };
}
