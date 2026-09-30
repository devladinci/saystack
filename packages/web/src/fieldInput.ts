import type { IDictationInput } from "@saystack/core";

import { createStreamingInput } from "./streamingInput.js";

export interface IFieldInputOptions {
  onValue: (value: string) => void;
}

export function createFieldInput(field: HTMLTextAreaElement | HTMLInputElement, { onValue }: IFieldInputOptions): IDictationInput {
  const streaming = createStreamingInput(field);
  let isShowing = false;

  const show = (text: string): void => {
    if (!isShowing) {
      isShowing = true;
      streaming.begin();
    }

    onValue(streaming.update(text, ""));
  };

  return {
    show,
    end(text) {
      if (text === null) {
        if (isShowing) {
          isShowing = false;
          onValue(streaming.cancel());
        }
        return;
      }

      if (!isShowing) {
        streaming.begin();
      }

      isShowing = false;
      streaming.update(text, "");
      onValue(streaming.end());
    },
  };
}
