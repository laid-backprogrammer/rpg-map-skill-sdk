---
name: rpg-original-voice-video
description: Edit a technical RPG workflow explainer around a supplied original recording and manuscript while preserving the full voice timeline. Use for proof-focused game footage, synchronized captions, GSAP camera moves, transitions, and subtle sound effects; not for replacing narration with TTS or silently rewriting a script.
---

# Original Voice RPG Explainer

Build picture and sound design around the user's existing voice, not a replacement narration. This is an optional companion workflow, independent of the map SDK. It includes no private recording, footage, fonts, vendor skill text, or render runtime.

## Preserve The Source Contract

- Use the supplied original recording and manuscript as authoritative inputs. Keep a byte-identical source copy and hash; use non-destructive derived media for supported formats or constant level adjustment.
- Unless the user explicitly authorizes otherwise, preserve the whole recording, order, pauses, timing, playback rate, and manuscript wording. No silence removal, shortening, reordered phrases, TTS, or rewritten captions. If the original is longer than a target duration, report the conflict rather than violating it.
- ASR may estimate cue timing, but it must not replace the supplied text. Compare recognized phrases to the manuscript and align manually where recognition is unreliable.
- Clarify publishing separately from making/exporting. A public release of workflow code is not permission to upload a person's voice, game assets, fonts, or footage.

## Prove Claims With Pictures

For each voice phrase, write a picture beat with global start/end, source file/time, crop, camera target, overlay text, transition, and SFX cue. Use actual game capture or actual SDK output. Label fabricated failure illustrations as illustrative; do not stage a bug and present it as a measured live failure. Do not invent a repository link, test count, perfect-generation guarantee, or token-savings percentage.

Show sufficient uninterrupted evidence: a complete movement into/against collision, front-to-back occlusion, a visible route and its endpoints, or a full maximum-rectangle overlay. Do not cover the evidence with large captions or crop its boundary while describing its size.

## Motion And Sound

Read [references/edit-checkpoints.md](references/edit-checkpoints.md) for seek-safe composition, alpha handoffs, voice/SFX checks, and render recovery.

- Use a single global time basis. GSAP is suitable for paused deterministic camera/text/mask timelines; picture/media playback must remain with the chosen renderer. Keep the shared camera across same-source micro-cuts instead of resetting its pose.
- Make each move serve the spoken explanation: establishing view, inspection punch-in, comparison, or result reveal. Avoid decorative motion while the viewer needs to inspect path/occlusion proof.
- Schedule the actual SFX peak at the visual event, not merely the file's beginning. Use short envelopes and low gains; protect consonants and sentence endings. Original voice is the primary track.
- If official GSAP skills or an installed HyperFrames adapter exist, read their current contracts and use them. HyperFrames is optional for this published skill; do not require it in the map SDK, copy its vendor skill text, or emulate undocumented private APIs. Otherwise use the user's selected tool and equivalent deterministic timing.

## Validate And Deliver

Check full-duration audio, transcript fidelity, random seeks/backward seeks, clip boundaries, source-clock continuity, media existence, caption safe zones, proof visibility, alpha transitions, and nonblank/moving exported pixels. Decode the whole final movie and verify its real format/duration. Measure loudness/true peak and inspect original-voice alignment at the start, middle, and end. Clearly distinguish computed evidence from manual listening you did not perform.

Keep approved versions unchanged and export a new named version for refinements. Provide the editable beat sheet and actual local video, with concise verification results. A preview being open does not prove the export succeeded.
