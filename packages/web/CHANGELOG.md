# @saystack/web

## 0.4.0

### Minor Changes

- 2532b80: Read-along moves the way reading does. The word and block marks appear in place instead of flying in from the corner, glide along a line and fade onto the next one, and are softer. The unread words dim and come back gradually. The page scrolls to keep the word being read in view until the reader scrolls by hand: `follow: false` turns that off, `locate()` brings the word back, and a `saystack-locate` event (`LOCATE_EVENT`) on the element does the same from outside. Words that can be clicked to seek show a pointer.

  A dictation settles instead of snapping. `createStreamingInput` gains `hold()`, which shows every word as not yet settled, and `settle()`, which keeps the words up until a final text that differs from what was streamed has finished arriving; `createFieldInput` uses both. The newest words stay in view in a field too small for them, and the words stay on a field that changes size, frame for frame; a field that hides its overflow is taken to grow with its text and is not scrolled. The spectrum line's working state pulses the bands in the shapes the voice makes instead of sweeping two blobs along the line.

### Patch Changes

- Updated dependencies [803527d]
- Updated dependencies [2532b80]
  - @saystack/core@0.4.0

## 0.1.4

### Patch Changes

- Updated dependencies [3faf824]
  - @saystack/core@0.3.0

## 0.1.3

### Patch Changes

- 120b41a: README: how a delivery style reaches the endpoint — the driver posts the session’s `fields` next to `text`, or a tag already pasted into the text.
- Updated dependencies [120b41a]
  - @saystack/core@0.2.1

## 0.1.2

### Patch Changes

- Updated dependencies [ba1dbed]
  - @saystack/core@0.2.0

## 0.1.1

### Patch Changes

- b86fbbf: `createWebRecorder` keeps audio that a released recorder delivers late out of the next recording.
- Updated dependencies [b86fbbf]
  - @saystack/core@0.1.1

## 0.1.0

### Minor Changes

- 38c80d8: Initial release.

### Patch Changes

- Updated dependencies [38c80d8]
  - @saystack/core@0.1.0
