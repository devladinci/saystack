export interface ICardLayoutInput {
  top: number;
  height: number;
  minTop: number;
  maxBottom: number;
  padding: number;
}

export interface ICardLayout {
  dy: number;
  maxBodyHeight: number | null;
}

// The reply lifts where it is and only moves as far as it must to sit between the header and the player.
export function liftCard({ top, height, minTop, maxBottom, padding }: ICardLayoutInput): ICardLayout {
  const room = Math.max(0, maxBottom - minTop);

  if (height > room) {
    return { dy: minTop - top, maxBodyHeight: Math.max(0, room - padding * 2) };
  }

  if (top + height > maxBottom) {
    return { dy: maxBottom - (top + height), maxBodyHeight: null };
  }

  if (top < minTop) {
    return { dy: minTop - top, maxBodyHeight: null };
  }

  return { dy: 0, maxBodyHeight: null };
}
