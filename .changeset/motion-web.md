---
"@saystack/web": minor
---

Read-along moves the way reading does. The word and block marks appear in place instead of flying in from the corner, glide along a line and fade onto the next one, and are softer. The unread words dim and come back gradually. The page scrolls to keep the word being read in view until the reader scrolls by hand: `follow: false` turns that off, `locate()` brings the word back, and a `saystack-locate` event (`LOCATE_EVENT`) on the element does the same from outside. Words that can be clicked to seek show a pointer.

A dictation settles instead of snapping. `createStreamingInput` gains `hold()`, which shows every word as not yet settled, and `settle()`, which keeps the words up until a final text that differs from what was streamed has finished arriving; `createFieldInput` uses both. The newest words stay in view in a field too small for them, and the words stay on a field that changes size, frame for frame; a field that hides its overflow is taken to grow with its text and is not scrolled. The spectrum line's working state pulses the bands in the shapes the voice makes instead of sweeping two blobs along the line.
