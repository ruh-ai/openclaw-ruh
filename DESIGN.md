# Ruh.ai — Brand & Design Guidelines

> The design source of truth for all Ruh.ai surfaces.
> Every UI change should reference this document.

---

## Brand Philosophy

**"Digital employees with a soul."**

Ruh.ai creates AI assistants that feel human — not robotic, not cold, not generic. The design should reflect this: warm, intelligent, subtly alive. Every screen should feel like you're working with something that has presence, not just rendering a form.

### Design Principles

1. **Warm Intelligence** — Purple/violet tones convey creativity and depth, not cold corporate blue. The interface feels thoughtful, not transactional.
2. **Subtle Life** — Micro-animations and ambient motion signal that the system is aware, breathing, present. Never flashy or distracting — like a colleague thinking beside you.
3. **Clean Confidence** — Minimal chrome, clear hierarchy, generous whitespace. The design is confident enough to be quiet.
4. **Progressive Revelation** — Show complexity only when needed. The creation flow should feel guided and organic, not like a configuration dashboard.

---

## Color Palette

### Brand Colors

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#ae00d0` | Primary actions, active states, brand accent |
| `primary-hover` | `#9400b4` | Primary button hover |
| `secondary` | `#7b5aff` | Secondary accent, links, gradient endpoint |
| `secondary-hover` | `#6b4bef` | Secondary hover |
| `tertiary` | `#12195e` | Deep accent, dark emphasis |

### Brand Gradient

```css
background: linear-gradient(to right, #ae00d0, #7b5aff);
```

Used for: primary gradient buttons, progress indicators, brand moments.

### Neutral Palette

| Token | Hex | Usage |
|---|---|---|
| `background` | `#f9f7f9` | Page background (warm, not cold gray) |
| `card` | `#ffffff` | Card surfaces |
| `sidebar-bg` | `#fdfbff` | Sidebar background |
| `accent-light` | `#f7e6fa` | Light purple accent background |
| `light-purple` | `#fdf4ff` | Very light purple wash |

### Text Colors

| Token | Hex | Usage |
|---|---|---|
| `text-primary` | `#121212` | Headings, primary body |
| `text-secondary` | `#4b5563` | Secondary text, descriptions |
| `text-tertiary` | `#827f82` | Helper text, timestamps |
| `text-white` | `#ffffff` | On dark/gradient backgrounds |

### Border Colors

| Token | Hex | Usage |
|---|---|---|
| `border-default` | `#e5e7eb` | Standard borders |
| `border-muted` | `#eff0f3` | Subtle dividers |
| `border-stroke` | `#e2e2e2` | Card strokes |
| `border-purple` | `rgba(176, 145, 182, 0.2)` | Soft purple stroke |

### Status Colors

| Token | Hex | Usage |
|---|---|---|
| `success` | `#22c55e` | Success, connected, active |
| `error` | `#ef4444` | Errors, destructive actions |
| `warning` | `#f59e0b` | Warnings, attention |
| `info` | `#3b82f6` | Informational |

---

## Typography

### Font Stack

| Role | Family | Weights |
|---|---|---|
| **Primary** | Satoshi | 400 (Regular), 500 (Medium), 700 (Bold) |
| **Display** | Sora | 500, 600, 700 |
| **Accent** | Jost | 400, 500 |

### Scale

| Level | Size | Weight | Family | Usage |
|---|---|---|---|---|
| H1 | 20px | 700 | Satoshi Bold | Page headings |
| H2 | 16px | 700 | Satoshi Bold | Section headings |
| Body | 16px | 400 | Satoshi Regular | Default text |
| Small | 14px | 400 | Satoshi Regular | Buttons, labels |
| XS | 12px | 400-500 | Satoshi | Tags, badges, helper text |
| Tiny | 10px | 500 | Satoshi Medium | Badges, indicators |

### Line Heights

- Default body: `1.4`
- Relaxed (chat, long text): `1.6`
- Tight (compact layouts): `1.2`

---

## Spacing

### Scale

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Tight element gaps |
| `sm` | 6px | Compact spacing |
| `md` | 8px | Standard element gap |
| `lg` | 12px | Chat messages, component groups |
| `xl` | 16px | Section gaps |
| `2xl` | 24px | Major section breaks |

### Padding Patterns

- Chips/pills: `px-2.5 py-1`
- Cards/containers: `px-4 py-3`
- Buttons: `px-3 py-2.5` (default), `px-6` (large)
- Inputs: `px-3 py-5` (generous vertical)

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `sm` | 4px | Inputs |
| `md` | 6px | Buttons (default) |
| `lg` | 8px | Larger buttons |
| `xl` | 12px | Cards, containers |
| `2xl` | 16px | Chat bubbles |
| `full` | 50% | Pills, avatars |

---

## Shadows

- `shadow-sm` — Subtle card elevation (default)
- `shadow-xs` — Minimal elevation
- No shadow on most elements — rely on borders for structure
- Focus: `ring-2 ring-primary/50`

---

## Existing Animations

| Name | Effect | Duration | Usage |
|---|---|---|---|
| `fadeIn` | opacity 0→1, translateY 8→0 | 0.3s ease-out | Messages, cards |
| `shimmer` | Background slide | 2s infinite | Loading states |
| `slide-in-right` | translateX 100%→0, opacity 0→1 | 0.35s cubic-bezier | Panels |
| Standard transition | all properties | 200ms | Buttons, borders |
| Input hover | border-color | 700ms | Inputs |
| Sidebar | width | 300ms ease-in-out | Sidebar collapse |

---

## Alive Additions

> These additions make the agent creation experience feel like you're bringing something to life — not filling out a form. They are **additive** to the existing brand. Nothing above changes.

### 1. Soul Pulse

A subtle, breathing glow around the agent avatar or creation card that grows stronger as the agent takes shape. Signals the agent is becoming "alive" as you configure it.

```css
@keyframes soul-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(174, 0, 208, 0.0);
  }
  50% {
    box-shadow: 0 0 20px 4px rgba(174, 0, 208, 0.12);
  }
}

.soul-pulse {
  animation: soul-pulse 3s ease-in-out infinite;
}

/* Stronger pulse as agent gains more configuration */
.soul-pulse-strong {
  animation: soul-pulse 2.4s ease-in-out infinite;
}
@keyframes soul-pulse-strong {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(174, 0, 208, 0.0);
  }
  50% {
    box-shadow: 0 0 28px 6px rgba(174, 0, 208, 0.18);
  }
}
```

**Where:** Agent avatar during creation, the "Review" card, the final deploy button.
**Rule:** Intensity scales with completeness. Empty agent = faint pulse. Fully configured = confident glow.

### 2. Ambient Gradient Drift

The brand gradient subtly shifts position over time on key surfaces. Not a loading spinner — just a living background.

```css
@keyframes gradient-drift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.gradient-drift {
  background: linear-gradient(135deg, #ae00d0, #7b5aff, #ae00d0);
  background-size: 200% 200%;
  animation: gradient-drift 8s ease-in-out infinite;
}
```

**Where:** Header bar of the creation flow, progress indicators, the "Create" button when ready.
**Rule:** Slow and subtle. If a user notices it consciously, it's too fast.

### 3. Spark Moments

Brief, celebratory micro-animations at key milestones: when a tool connects, when the agent gets a name, when configuration is complete.

```css
@keyframes spark {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.spark {
  animation: spark 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

**Where:** Success states (tool connected, skill added, trigger configured), milestone transitions.
**Rule:** Only at real milestones, not every click. Max 3-4 spark moments per creation flow.

### 4. Typewriter Presence

When the builder assistant responds, text appears with a subtle character-by-character or word-by-word cadence. Not a raw stream dump — a thoughtful reveal.

```css
@keyframes typewriter-fade {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.typewriter-word {
  animation: typewriter-fade 0.15s ease-out forwards;
  opacity: 0;
}
```

**Where:** Builder chat responses, agent description preview, review summary.
**Rule:** Only for builder-generated content, not user input. Should feel like someone composing thoughts, not a loading animation.

### 5. Warmth Gradient on Hover

Interactive cards and options get a subtle warm purple gradient wash on hover instead of a flat color change.

```css
.warmth-hover {
  position: relative;
  overflow: hidden;
}

.warmth-hover::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(174, 0, 208, 0.06) 0%,
    transparent 60%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.warmth-hover:hover::before {
  opacity: 1;
}
```

**Where:** Template selection cards, tool connection cards, skill cards, trigger options.
**Rule:** The gradient follows the cursor position (set `--mouse-x` and `--mouse-y` via JS). Creates a sense of the interface responding to your presence.

### 6. Breathing Input Focus

When an input is focused, the border gently pulses once — like the system acknowledging your attention.

```css
@keyframes focus-breathe {
  0% {
    border-color: #ae00d0;
    box-shadow: 0 0 0 0 rgba(174, 0, 208, 0.15);
  }
  50% {
    border-color: #ae00d0;
    box-shadow: 0 0 0 4px rgba(174, 0, 208, 0.08);
  }
  100% {
    border-color: #ae00d0;
    box-shadow: 0 0 0 2px rgba(174, 0, 208, 0.05);
  }
}

.focus-breathe:focus {
  animation: focus-breathe 0.6s ease-out forwards;
}
```

**Where:** Text inputs during agent creation (name, description, system prompt).
**Rule:** Single breath on focus, then settle. Not a continuous pulse.

### 7. Stage Transition Flow

When moving between creation stages (Configure → Review → Deploy), the transition should feel like a purposeful step forward, not a page swap.

```css
@keyframes stage-enter {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes stage-exit {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(-24px);
  }
}

.stage-enter {
  animation: stage-enter 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.stage-exit {
  animation: stage-exit 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
```

**Where:** Transitions between Create → Configure → Review → Deploy stages.
**Rule:** Content slides in the direction of progress (left-to-right). Going back reverses.

### 8. Soul Born Moment

When the agent is fully created and ready to deploy, a one-time celebration: the agent card gets a brief radiant glow outward, the gradient intensifies, and the card settles into its "alive" state with a persistent gentle soul-pulse.

```css
@keyframes soul-born {
  0% {
    box-shadow: 0 0 0 0 rgba(174, 0, 208, 0);
    transform: scale(1);
  }
  30% {
    box-shadow: 0 0 40px 12px rgba(174, 0, 208, 0.2);
    transform: scale(1.01);
  }
  60% {
    box-shadow: 0 0 60px 20px rgba(123, 90, 255, 0.15);
    transform: scale(1.005);
  }
  100% {
    box-shadow: 0 0 20px 4px rgba(174, 0, 208, 0.1);
    transform: scale(1);
  }
}

.soul-born {
  animation: soul-born 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
```

**Where:** The final moment when the agent is created/deployed. Once per agent creation.
**Rule:** This is THE moment. The one time the UI is allowed to be dramatic. After the animation, the card settles into a calm `soul-pulse`.

---

## Alive Additions — Usage Rules

1. **Less is more.** Every animation should pass the "would I notice this on the 50th use?" test. If yes, it's too much.
2. **Respect `prefers-reduced-motion`.** All alive additions must be disabled when the user has reduced motion enabled.
3. **Performance budget.** No animation should cause layout shifts or frame drops. Use `transform` and `opacity` only — never animate `width`, `height`, or `margin`.
4. **Progressive intensity.** The creation flow should feel like bringing something to life. Start calm, build subtly, culminate at the "soul born" moment.
5. **Never block interaction.** Animations are decorative. No animation should delay or prevent user action.
6. **Brand-consistent.** All glows, pulses, and gradients use the brand purple (`#ae00d0`) and secondary (`#7b5aff`). No new colors introduced.

---

## Dark Mode

Supported via CSS variables. All brand colors remain the same. Backgrounds flip to deep purple-black:

| Token | Light | Dark |
|---|---|---|
| `background` | `#f9f7f9` | `#0b020d` |
| `card` | `#ffffff` | `#241826` |
| `text-primary` | `#121212` | `#e2d7e4` |

Alive additions in dark mode: glow effects become slightly more visible (increase opacity by ~30%) since they show better against dark backgrounds.

---

## Key Files

| File | What it controls |
|---|---|
| `agent-builder-ui/tailwind.config.js` | Color tokens, spacing, border radius |
| `agent-builder-ui/app/globals.css` | CSS variables, keyframes, global styles |
| `agent-builder-ui/components/ui/button.tsx` | Button variants |
| `agent-builder-ui/components/ui/input.tsx` | Input styling |
| `DESIGN.md` (this file) | Brand source of truth |

---

## References

- Product vision: `docs/project-focus.md`
- Architecture: `docs/knowledge-base/001-architecture.md`
- Agent builder UI notes: `docs/knowledge-base/008-agent-builder-ui.md`
