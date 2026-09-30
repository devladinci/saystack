export interface IWordTiming {
  text: string;
  charStart: number;
  charEnd: number;
  start: number;
  end: number;
}

export interface ISpeechPause {
  start: number;
  end: number;
}

export interface ISpeechEnvelope {
  duration: number;
  speechStart: number;
  speechEnd: number;
  pauses: readonly ISpeechPause[];
}

export interface ISpeechMark {
  charIndex: number;
  time: number;
}

export interface IWordToken {
  text: string;
  charStart: number;
  charEnd: number;
}

interface IAnchor {
  units: number;
  time: number;
}

const FRAME_SECONDS = 0.01;

const MIN_PAUSE_SECONDS = 0.12;

const VOICED_BELOW_PEAK_DB = 30;

const SILENCE_FLOOR_DB = -70;

const WORD_BASE_UNITS = 0.6;

const CLAUSE_PAUSE_UNITS = 2.5;

const SENTENCE_PAUSE_UNITS = 5;

const PAUSE_MATCH_TOLERANCE = 0.25;

const SENTENCE_END = /[.!?…]["'”’»)\]]*$/;

const CLAUSE_END = /[,;:—–]["'”’»)\]]*$/;

const LETTER = /[\p{L}\p{N}]/u;

export function tokenizeWords(text: string): IWordToken[] {
  return Array.from(text.matchAll(/\S+/g), (match) => ({
    text: match[0],
    charStart: match.index,
    charEnd: match.index + match[0].length,
  }));
}

export function speechEnvelope(samples: Float32Array, sampleRate: number): ISpeechEnvelope {
  const duration = sampleRate > 0 ? samples.length / sampleRate : 0;
  const frame = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const frameSeconds = sampleRate > 0 ? frame / sampleRate : FRAME_SECONDS;
  const frameCount = Math.floor(samples.length / frame);
  const whole: ISpeechEnvelope = { duration, speechStart: 0, speechEnd: duration, pauses: [] };

  if (frameCount === 0) {
    return whole;
  }

  const levels = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    let sum = 0;

    for (let offset = index * frame; offset < (index + 1) * frame; offset += 1) {
      const sample = samples[offset] ?? 0;
      sum += sample * sample;
    }

    levels[index] = 20 * Math.log10(Math.sqrt(sum / frame) + 1e-9);
  }

  const sorted = Float32Array.from(levels).sort();
  const peak = sorted[Math.floor(sorted.length * 0.95)] ?? SILENCE_FLOOR_DB;
  const threshold = Math.max(peak - VOICED_BELOW_PEAK_DB, SILENCE_FLOOR_DB);
  const isVoiced = (index: number): boolean => (levels[index] ?? SILENCE_FLOOR_DB) > threshold;

  let first = 0;

  while (first < frameCount && !isVoiced(first)) {
    first += 1;
  }

  let last = frameCount - 1;

  while (last > first && !isVoiced(last)) {
    last -= 1;
  }

  if (first >= frameCount) {
    return whole;
  }

  const pauses: ISpeechPause[] = [];
  let quietFrom = -1;

  for (let index = first; index <= last; index += 1) {
    if (!isVoiced(index)) {
      if (quietFrom < 0) {
        quietFrom = index;
      }
      continue;
    }

    if (quietFrom >= 0 && (index - quietFrom) * frameSeconds >= MIN_PAUSE_SECONDS) {
      pauses.push({ start: quietFrom * frameSeconds, end: index * frameSeconds });
    }
    quietFrom = -1;
  }

  return {
    duration,
    speechStart: first * frameSeconds,
    speechEnd: Math.min(duration, (last + 1) * frameSeconds),
    pauses,
  };
}

const pauseUnitsAfter = (word: string): number => {
  if (SENTENCE_END.test(word)) {
    return SENTENCE_PAUSE_UNITS;
  }

  return CLAUSE_END.test(word) ? CLAUSE_PAUSE_UNITS : 0;
};

const spokenLength = (word: string): number => Array.from(word).filter((char) => LETTER.test(char)).length;

const interpolate = (anchors: readonly IAnchor[], units: number): number => {
  const firstAnchor = anchors[0];

  if (firstAnchor === undefined) {
    return 0;
  }

  let previous = firstAnchor;

  for (const anchor of anchors) {
    if (units <= anchor.units) {
      const span = anchor.units - previous.units;

      return span <= 0 ? anchor.time : previous.time + ((units - previous.units) / span) * (anchor.time - previous.time);
    }
    previous = anchor;
  }

  return previous.time;
};

export function estimateWordTimings(text: string, envelope: ISpeechEnvelope): IWordTiming[] {
  const tokens = tokenizeWords(text);

  if (tokens.length === 0) {
    return [];
  }

  const speechStart = Math.max(0, envelope.speechStart);
  const speechEnd = envelope.speechEnd > speechStart ? envelope.speechEnd : Math.max(speechStart, envelope.duration);
  const starts: number[] = [];
  const ends: number[] = [];
  const gaps: { from: number; to: number }[] = [];
  let units = 0;

  tokens.forEach((token, index) => {
    starts.push(units);
    units += spokenLength(token.text) + WORD_BASE_UNITS;
    ends.push(units);

    const pause = index < tokens.length - 1 ? pauseUnitsAfter(token.text) : 0;

    if (pause > 0) {
      gaps.push({ from: units, to: units + pause });
      units += pause;
    }
  });

  const totalUnits = units;
  const span = speechEnd - speechStart;
  const tolerance = Math.max(0.5, span * PAUSE_MATCH_TOLERANCE);
  const anchors: IAnchor[] = [{ units: 0, time: speechStart }];
  let nextGap = 0;

  for (const pause of envelope.pauses) {
    if (pause.start <= speechStart || pause.end >= speechEnd) {
      continue;
    }

    const middle = (pause.start + pause.end) / 2;
    let best = -1;
    let bestDistance = tolerance;

    for (let index = nextGap; index < gaps.length; index += 1) {
      const gap = gaps[index];

      if (gap === undefined) {
        continue;
      }

      const expected = speechStart + (((gap.from + gap.to) / 2) / totalUnits) * span;
      const distance = Math.abs(expected - middle);

      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }

    const matched = gaps[best];
    const previous = anchors[anchors.length - 1];

    if (matched === undefined || previous === undefined || pause.start <= previous.time || matched.from <= previous.units) {
      continue;
    }

    anchors.push({ units: matched.from, time: pause.start }, { units: matched.to, time: pause.end });
    nextGap = best + 1;
  }

  anchors.push({ units: totalUnits, time: speechEnd });

  return tokens.map((token, index) => ({
    ...token,
    start: interpolate(anchors, starts[index] ?? 0),
    end: interpolate(anchors, ends[index] ?? 0),
  }));
}

export function wordTimingsFromMarks(text: string, marks: readonly ISpeechMark[], duration: number): IWordTiming[] {
  const tokens = tokenizeWords(text);
  const sorted = [...marks].sort((a, b) => a.charIndex - b.charIndex);
  const found = tokens.map((token) => sorted.find((mark) => mark.charIndex >= token.charStart && mark.charIndex < token.charEnd)?.time);

  const starts = found.map((time, index) => {
    if (time !== undefined) {
      return time;
    }

    let before = index - 1;

    while (before >= 0 && found[before] === undefined) {
      before -= 1;
    }

    let after = index + 1;

    while (after < found.length && found[after] === undefined) {
      after += 1;
    }

    const fromTime = before >= 0 ? (found[before] ?? 0) : 0;
    const toTime = after < found.length ? (found[after] ?? duration) : duration;

    return fromTime + ((toTime - fromTime) * (index - before)) / (after - before);
  });

  for (let index = 1; index < starts.length; index += 1) {
    starts[index] = Math.max(starts[index] ?? 0, starts[index - 1] ?? 0);
  }

  return tokens.map((token, index) => ({
    ...token,
    start: starts[index] ?? 0,
    end: starts[index + 1] ?? duration,
  }));
}

export function wordAt(words: readonly IWordTiming[], time: number): number {
  let low = 0;
  let high = words.length - 1;
  let found = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;

    if ((words[middle]?.start ?? Infinity) <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}
