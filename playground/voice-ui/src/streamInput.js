// Shows dictated words over a textarea while they stream in. New words blur
// in; words that are still being recognised shimmer until they are final.
// The textarea holds the real value the whole time, so the page's own
// submit, autosize and undo keep working. The textarea's parent must be
// positioned, and the mirror must share the textarea's text metrics.

const ENTER_MS = 520;

const split = (text) => (text ? text.trim().split(/\s+/).filter(Boolean) : []);

export function createStreamingInput(textarea, { onResize } = {}) {
  const field = textarea.parentElement;
  const mirror = document.createElement("div");
  mirror.className = "ss-mirror";
  mirror.setAttribute("aria-hidden", "true");
  field.append(mirror);

  let base = "";
  let shown = [];
  let streaming = false;

  function render(next) {
    const now = performance.now();
    const frag = document.createDocumentFragment();
    frag.append(base);
    next.forEach((w, i) => {
      const prev = shown[i];
      w.born = prev && prev.text === w.text ? prev.born : now;
      if (i > 0) frag.append(" ");
      const span = document.createElement("span");
      span.className = w.final ? "ss-sw" : "ss-sw is-interim";
      span.textContent = w.text;
      const age = now - w.born;
      if (age < ENTER_MS) {
        span.classList.add("is-new");
        span.style.animationDelay = `${-age}ms`;
      }
      frag.append(span);
    });
    const caret = document.createElement("span");
    caret.className = "ss-caret";
    frag.append(caret);
    mirror.replaceChildren(frag);
    mirror.scrollTop = textarea.scrollTop;
    shown = next;
  }

  return {
    get streaming() {
      return streaming;
    },
    begin() {
      base = textarea.value;
      if (base && !/\s$/.test(base)) base += " ";
      shown = [];
      streaming = true;
      field.classList.add("is-streaming");
      render([]);
    },
    update(finalText, interimText) {
      if (!streaming) return;
      const next = [
        ...split(finalText).map((text) => ({ text, final: true })),
        ...split(interimText).map((text) => ({ text, final: false })),
      ];
      textarea.value = base + next.map((w) => w.text).join(" ");
      onResize?.();
      render(next);
    },
    end() {
      streaming = false;
      field.classList.remove("is-streaming");
      mirror.replaceChildren();
      textarea.value = textarea.value.trimEnd();
      onResize?.();
    },
    cancel() {
      streaming = false;
      field.classList.remove("is-streaming");
      mirror.replaceChildren();
      textarea.value = base.trimEnd();
      onResize?.();
    },
  };
}
