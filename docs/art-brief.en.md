# WithYou — Art & Animation Brief

> A spec you can hand directly to an artist/animator. (Korean version: `art-brief.md`)

## 0. One-liner
**WithYou (working title: CoupleWidget)** is a desktop widget for couples. A small character sits in the bottom-right corner of each person's screen, and **the character on _your_ screen represents _your partner_**. It reacts to your partner's real-time PC activity (gaming / studying / music / video / away). Planned for a Steam release.

Deliverables must be **Rive files (`.riv`)** — not plain images/sprites, but an **interactive rig with a state machine and inputs**.

---

## 1. Technical constraints (must follow)

| Item | Requirement |
|---|---|
| Format | **Rive** (`.riv`). Runtime is the web `@rive-app/react-canvas` v4.x |
| Graphics | **Vector preferred** (the widget scales 0.8×–1.4×; it must not get blurry/pixelated) |
| Background | **Fully transparent** (only the character shows; it composites onto the screen) |
| Alignment | Character's **feet at the bottom of the artboard** (code uses BottomCenter, Fit.Contain) |
| Artboard ratio | Portrait-ish preferred (current display area ≈ 220×170; vector means real size is up to you — e.g. 400×400) |
| State machine | **One single state machine** containing all states/transitions/inputs below. Name is free (the code auto-plays the first state machine) — suggested name: `Main` |
| Performance | 60fps; keep file size to a few MB if possible |
| Delivery | ① the editable Rive editor source **and** ② the exported runtime `.riv` |

> Note: The Rive runtime is open source (MIT), so **there is no runtime license cost at release**.

---

## 2. Character concept
- A placeholder **cat** character (`cat-idle.riv`) currently exists. You may evolve it or propose a new direction.
- Tone: **cute and warm couple vibe**, with a simple, clear silhouette that reads well at small sizes.
- Expressions/poses must be **instantly distinguishable at a glance** (the widget is small).

---

## 3. Animation list

### 3-1. Persistent activity loops — only one plays at a time, looping
> Parentheses are ideas for how to portray each state (interpret freely)

| # | State | Idea | Priority |
|---|---|---|---|
| 0 | `idle` | Default resting + breathing bob, **look-at-cursor** | **P1** |
| 1 | `gaming` | Headset + tapping a keyboard 🎮 | **P1** |
| 2 | `working` (studying/working) | Glasses + book/monitor 📚 | **P1** |
| 3 | `music` | Earphones + bobbing to a rhythm 🎧 | **P1** |
| 4 | `video` | 3D glasses + popcorn, watching a screen 🍿 | **P1** |
| 5 | `afk` (away) | Dozing/sleeping 💤 | **P1** |
| — | `happy` | Excited/delighted (event-driven) | P1 |
| — | `offline` | Faded/glum (partner disconnected) — optional; code currently desaturates | P2 |

### 3-2. One-shot emotes — play once when triggered, then return to the current loop
| Emote | Idea | Priority |
|---|---|---|
| `heart` | Blow/throw a heart ❤️ (signature) | **P1** |
| `kiss` | Kiss 😘 | **P1** |
| `hug` | Hug 🤗 | **P1** |
| `laugh` | Laugh out loud 😂 | **P1** |
| `sad` | Glum/teary 🥺 | **P1** |
| `wave` | Wave hello 👋 | **P1** |
| `poke` | Poke reaction 👉 (when the other person clicks) | **P1** |
| `celebrate` | Anniversary/milestone celebration 🎉 (confetti, etc.) | P1 |

### 3-3. Look-at-cursor
- Already implemented in the current file via a **pointer Listener** — keep the same approach (eyes/head follow the mouse).
- The code forwards the global cursor position into the canvas, so make it **driven by pointer position**.

### 3-4. Lip-sync — Phase 2 (Feature 1)
- The mouth opens/closes based on voice/mic volume.
- Simplified: take **mouth-open amount as a 0–100 number input** and map it to mouth shapes (precise visemes are lower priority).

### 3-5. Skins / variants — Phase 3 (Feature 4)
- 2–3 color/outfit variants reusing the same rig.
- Recommended for v1: **a separate artboard (or separate `.riv`) per skin**. (Switching skins via a skin number input on one artboard is also fine — proposals welcome.)

### 3-6. Shared room background — Phase 2 (Feature 4)
- One "home/room" background where two characters appear together (static or a light loop).
- Design for **two characters standing side by side**.

---

## 4. ⭐ State machine input contract (most important)

The code drives the **exact input names/types** below. **Match the names, types, and values precisely** — the values map 1:1 to the app's internal types.

```
State machine: (name free / suggested "Main") — exactly one

[Number] state        // persistent state. Integer values:
                      //   0 = idle
                      //   1 = gaming
                      //   2 = working
                      //   3 = music
                      //   4 = video
                      //   5 = afk
[Boolean] offline     // true → offline/glum pose (optional, P2)

[Trigger] heart       // one-shot emotes (after firing, return to the current state loop)
[Trigger] kiss
[Trigger] hug
[Trigger] laugh
[Trigger] sad
[Trigger] wave
[Trigger] poke
[Trigger] celebrate

[Number] mouthOpen    // 0–100, lip-sync mouth opening (P2). 0 when unused.
                      // Look-at-cursor is handled by the pointer Listener (no input needed).
                      // Optionally also expose lookX / lookY (-100 to 100).
```

- **Transitions**: move naturally (or instantly) between `state` values. Emote triggers play from any state and return to the current `state` when finished.
- Use the **exact English input names** (`state`, `heart`, etc.) — the code references them by string.

> Current status: the code does not yet drive these inputs; it temporarily shows emoji overlays instead. Once a `.riv` arrives following this contract, we will wire it up in code.

---

## 5. Deliverables & acceptance

**Deliverables**
- [ ] Editable Rive source + exported runtime `.riv`
- [ ] A single state machine satisfying the input contract in section 4
- [ ] Transparent background / bottom-aligned / vector

**Acceptance**
- [ ] Loads and plays correctly in `@rive-app/react-canvas` (web)
- [ ] All inputs from section 4 behave as intended (state 0–5 transitions, 8 triggers, mouthOpen)
- [ ] No degradation when scaled 0.8×–1.4×
- [ ] 60fps, reasonable file size

---

## 6. Priority / milestones

- **Phase 1 (MVP)**: character + `idle` (look-at) + `happy` + 5 activity loops + 8 emote triggers (incl. celebrate). → makes the widget immediately rich.
- **Phase 2**: lip-sync (`mouthOpen`) + shared room background.
- **Phase 3**: 2–3 skins.

---

## 7. Reference material we'll provide
- Screenshots/video of the current widget build (for context)
- The current `cat-idle.riv` (reference for style + look-at behavior)
- This brief + the input contract table in section 4
