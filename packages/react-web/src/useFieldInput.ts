import type { IDictationInput } from "@saystack/core";
import { createFieldInput } from "@saystack/web";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

type Field = HTMLTextAreaElement | HTMLInputElement;

interface IBound {
  element: Field;
  input: IDictationInput;
}

export function useFieldInput(field: RefObject<Field | null>, onValue: (value: string) => void): IDictationInput {
  const onValueRef = useRef(onValue);

  useEffect(() => {
    onValueRef.current = onValue;
  });

  const [input] = useState((): IDictationInput => {
    let bound: IBound | null = null;

    const current = (): IDictationInput | null => {
      const element = field.current;

      if (element === null) {
        return null;
      }

      if (bound?.element !== element) {
        bound = { element, input: createFieldInput(element, { onValue: (value) => onValueRef.current(value) }) };
      }

      return bound.input;
    };

    return {
      show: (text) => current()?.show(text),
      end: (text) => current()?.end(text),
    };
  });

  return input;
}
