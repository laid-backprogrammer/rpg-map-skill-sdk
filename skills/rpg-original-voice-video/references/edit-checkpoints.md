# Edit Checkpoints

## Before Editing

Record the source voice hash, codec, sample rate, decoded duration, manuscript, and authorized scope. Keep the original file untouched. AAC/MP4 container duration and decoded PCM duration can differ by encoder priming/padding; record both rather than claiming a word was lost based solely on a few milliseconds.

Use source speech boundaries for captions, with literal manuscript text and comfortable reading intervals. A short reveal before/after the recording is possible if requested; it must not trim the voice to fit a preset project length. The finished movie should cover the complete decoded voice interval.

## Timeline Contract

Store all positions on a global seconds clock, and resolve each footage beat as:

```text
sourceTime = sourceStart + (globalTime - clipStart) * playbackRate
```

Default voice `clipStart=0`, `sourceStart=0`, `playbackRate=1`. Same-source adjacent clips are continuous only when the outgoing source end equals the incoming source start. Avoid duplicating or skipping footage during a proof window. A change in shot does not require a new camera state.

Animate explicit values on one paused GSAP timeline, not timers, wall-clock reads, random values, DOM mutation callbacks, or animation restarted on each seek. Build stable initial states and use `fromTo`/`set` with deliberate start times; verify backward seeks as well as forward playback. The engine/renderer owns media decoding and audio playback, not GSAP.

## Alpha And Masks

Crossfades need explicit outgoing/incoming compositing. Simultaneously fading two layers can darken or expose the background when both are translucent. For a mask reveal, keep the outgoing opaque until the incoming fully covers it, then retire the outgoing. Do not set both to zero at a cut boundary.

For same-source proof handoffs, prefer an instantaneous opaque source switch with a shared camera, or a continuous underlying media layer with overlay changes. Keep mask containers visible and dimensioned before animating them. Test a frame immediately before, at, and after every seam, including fractional-frame sample times.

Crop wrappers and camera wrappers should be separate from timed media visibility. A foreground mask must not accidentally clip the entire composition. Maximum-rectangle/route proof windows may need an independent contain-fit pane that does not inherit a zoomed background camera.

## Sound

Keep the voice continuous on one primary track. Any level-adjusted derivative retains the source hash record and no timing changes. Music is optional; do not add it automatically when it competes with the voice.

For each SFX, save file/source, start, measured or estimated peak offset, intended global cue, gain, attack, release, and license. Schedule `start = cue - peakOffset` when nonnegative and within the project. Validate how the renderer interprets automation: absolute volume values and multiplicative gains are not interchangeable. A static `0.1` plus automation `1` may become full volume in some adapters.

Use measured speech clarity rather than treating all effects as equally quiet. Avoid loud broadband whooshes over consonants. Loudness/true-peak checks establish level, not semantic voice preservation. For content timing, compare decoded original and exported audio in multiple voiced windows, allowing documented container priming but checking that alignment does not drift. Added SFX may reduce correlation without deleting speech; inspect speech-band and SFX-heavy regions rather than using a single threshold blindly. Listen only when a playback tool is actually available, and do not claim that you did if you only measured files.

## Export And Bounded Recovery

Use the installed renderer's current commands and retain exact tool/version/configuration records. Check layout/runtime errors, representative seeks and proof frames, then render. If a long capture fails, inspect logs and memory/codec/browser evidence before blaming the composition.

Choose bounded recovery, such as reducing workers or native segmented capture with browser recycling. Segments must retain the original global `frameIndex/fps` clock and source offsets. Concatenate picture without dropping/repeating frames and mix the full voice once afterward. Segmentation is an operational technique, not permission to cut the recording. Never kill unrelated browsers, games, or processes just to free memory.

After export: verify real dimensions/fps/codecs/duration, decode the entire movie, count expected frames, inspect seam frames, check nonblank pixels and movement in proof windows, confirm subtitle visibility, and verify voice alignment. Preserve earlier approved movies. A failed retry budget ends with an honest limitation and a preserved editable project, not an unverified deliverable.
