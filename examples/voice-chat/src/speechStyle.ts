import type { IStyleMap } from "@saystack/core";

// The example's own style vocabulary: what the demo engine (Higgs Audio v3 on oMLX) accepts as an inline
// tag. saystack ships no styles, so this list is the app's declaration, the same as any other engine's would be.
export const speechStyleMap: IStyleMap = {
  channel: { mode: "tag", template: "<|emotion:{style}|>" },
  rules: [
    { value: "amusement", label: "amused" },
    { value: "enthusiasm", label: "enthusiastic" },
    { value: "contemplation", label: "thoughtful" },
    { value: "sadness", label: "sad" },
    { value: "surprise", label: "surprised" },
  ],
};
