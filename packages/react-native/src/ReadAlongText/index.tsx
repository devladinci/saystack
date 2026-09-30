import { useMemo } from "react";
import type { LayoutChangeEvent, StyleProp, TextStyle } from "react-native";
import { StyleSheet, View } from "react-native";

import type { IReadingText } from "../readAloud/readAlongMap.js";
import type { IVoiceTheme } from "../theme.js";
import { ReadAlongBlock } from "./ReadAlongBlock.js";

interface IProps {
  text: IReadingText;
  activeWord: number;
  theme: IVoiceTheme;
  textStyle?: StyleProp<TextStyle>;
  onWordPress?: (index: number) => void;
  onBlockLayout?: (block: number, y: number, height: number) => void;
}

const inBlock = (block: IReadingText["blocks"][number], index: number): number =>
  index >= (block[0]?.index ?? 0) && index <= (block.at(-1)?.index ?? -1) ? index : -1;

export default function ReadAlongText({ text, activeWord, theme, textStyle, onWordPress, onBlockLayout }: IProps) {
  const themed = useMemo(() => themedStyles(theme), [theme]);
  const paragraph = useMemo(() => [styles.paragraph, themed.text, textStyle], [themed, textStyle]);
  const layouts = useMemo(
    () =>
      text.blocks.map((_, block) =>
        onBlockLayout === undefined
          ? undefined
          : (event: LayoutChangeEvent) =>
              onBlockLayout(block, event.nativeEvent.layout.y, event.nativeEvent.layout.height),
      ),
    [text.blocks, onBlockLayout],
  );

  return (
    <View style={styles.blocks}>
      {text.blocks.map((block, index) => (
        <ReadAlongBlock
          key={block[0]?.index ?? -1}
          words={block}
          activeWord={inBlock(block, activeWord)}
          textStyle={paragraph}
          activeStyle={themed.active}
          {...(onWordPress === undefined ? {} : { onWordPress })}
          {...(layouts[index] === undefined ? {} : { onLayout: layouts[index] })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: {
    gap: 8,
  },
  paragraph: {
    fontSize: 15.5,
    lineHeight: 23,
  },
});

function themedStyles(theme: IVoiceTheme) {
  return StyleSheet.create({
    text: {
      color: theme.text,
    },
    active: {
      backgroundColor: theme.highlight,
      color: theme.highlightInk,
    },
  });
}
