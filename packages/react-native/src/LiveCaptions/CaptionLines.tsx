import type { StyleProp, TextStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

export interface ICaptionLine {
  key: string;
  text: string;
}

interface IProps {
  lines: readonly ICaptionLine[];
  textStyle: StyleProp<TextStyle>;
}

const styles = StyleSheet.create({
  oldest: {
    opacity: 0.3,
  },
  older: {
    opacity: 0.65,
  },
});

// The oldest two lines fade out, the way text scrolls away under a mask.
const FADES = [styles.oldest, styles.older];

export function CaptionLines({ lines, textStyle }: IProps) {
  return (
    <View>
      {lines.map((line, index) => (
        <Text key={line.key} style={[textStyle, FADES[index]]}>
          {line.text.trimEnd()}
        </Text>
      ))}
    </View>
  );
}
