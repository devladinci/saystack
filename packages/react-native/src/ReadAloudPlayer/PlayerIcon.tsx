import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

export type PlayerIconName = "play" | "pause" | "replay" | "previous" | "next" | "close";

interface IProps {
  name: PlayerIconName;
  color: string;
  size: number;
}

// Plain shapes, so the player needs no icon font; apps can pass their own icons instead.
export function PlayerIcon({ name, color, size }: IProps) {
  const shapes = useMemo(() => shapesFor(color, size), [color, size]);

  if (name === "play") {
    return (
      <View style={shapes.box}>
        <View style={shapes.playing} />
      </View>
    );
  }

  if (name === "pause") {
    return (
      <View style={[shapes.box, shapes.row]}>
        <View style={shapes.bar} />
        <View style={shapes.bar} />
      </View>
    );
  }

  if (name === "previous" || name === "next") {
    return (
      <View style={[shapes.box, shapes.row, name === "previous" ? null : shapes.flipped]}>
        <View style={shapes.thin} />
        <View style={shapes.back} />
      </View>
    );
  }

  if (name === "close") {
    return (
      <View style={shapes.box}>
        <View style={[shapes.cross, shapes.turnLeft]} />
        <View style={[shapes.cross, shapes.turnRight]} />
      </View>
    );
  }

  return (
    <View style={shapes.box}>
      <View style={shapes.ring} />
      <View style={shapes.arrow} />
    </View>
  );
}

function shapesFor(color: string, size: number) {
  const unit = size / 24;

  return StyleSheet.create({
    box: {
      width: size,
      height: size,
      alignItems: "center",
      justifyContent: "center",
    },
    row: {
      flexDirection: "row",
      gap: unit * 4,
    },
    flipped: {
      transform: [{ scaleX: -1 }],
    },
    playing: {
      marginLeft: unit * 3,
      borderTopWidth: unit * 8,
      borderBottomWidth: unit * 8,
      borderLeftWidth: unit * 13,
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
      borderLeftColor: color,
    },
    bar: {
      width: unit * 4,
      height: unit * 15,
      borderRadius: unit * 1.5,
      backgroundColor: color,
    },
    thin: {
      width: unit * 2.5,
      height: unit * 12,
      borderRadius: unit,
      backgroundColor: color,
    },
    back: {
      marginLeft: -unit * 3,
      borderTopWidth: unit * 6,
      borderBottomWidth: unit * 6,
      borderRightWidth: unit * 10,
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
      borderRightColor: color,
    },
    cross: {
      position: "absolute",
      width: unit * 16,
      height: unit * 2,
      borderRadius: unit,
      backgroundColor: color,
    },
    turnLeft: {
      transform: [{ rotate: "45deg" }],
    },
    turnRight: {
      transform: [{ rotate: "-45deg" }],
    },
    ring: {
      width: unit * 15,
      height: unit * 15,
      borderRadius: unit * 7.5,
      borderWidth: unit * 2,
      borderColor: color,
      borderTopColor: "transparent",
      transform: [{ rotate: "-35deg" }],
    },
    arrow: {
      position: "absolute",
      top: unit * 3.5,
      right: unit * 4.5,
      borderLeftWidth: unit * 4,
      borderRightWidth: unit * 4,
      borderTopWidth: unit * 5,
      borderLeftColor: "transparent",
      borderRightColor: "transparent",
      borderTopColor: color,
      transform: [{ rotate: "20deg" }],
    },
  });
}
