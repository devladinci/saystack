import { memo } from "react";
import type { LayoutChangeEvent, StyleProp, TextStyle } from "react-native";
import { Text } from "react-native";

import type { IReadingWord } from "../readAloud/readAlongMap.js";

interface IProps {
  words: readonly IReadingWord[];
  activeWord: number;
  textStyle: StyleProp<TextStyle>;
  activeStyle: StyleProp<TextStyle>;
  onWordPress?: (index: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}

// Only the blocks holding the old and the new word re-render as the voice moves on.
function ReadAlongBlockBase({ words, activeWord, textStyle, activeStyle, onWordPress, onLayout }: IProps) {
  return (
    <Text style={textStyle} onLayout={onLayout}>
      {words.map((word, position) => {
        const handlePress = onWordPress === undefined ? undefined : () => onWordPress(word.index);

        return (
          <Text key={word.index} style={word.index === activeWord ? activeStyle : undefined} onPress={handlePress}>
            {position < words.length - 1 ? `${word.text} ` : word.text}
          </Text>
        );
      })}
    </Text>
  );
}

export const ReadAlongBlock = memo(ReadAlongBlockBase);
