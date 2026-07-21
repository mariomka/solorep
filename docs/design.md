# Design System

## Direction

Solorep should feel like a premium training journal or a modern technical manual: precise, calm, disciplined, and built to last. The interface is editorial rather than decorative. It must not drift toward the usual fitness aesthetic of gradients, oversized motivational graphics, heavy shadows, or gamification.

The hierarchy is created with type, spacing, hairline rules, and one restrained ink-blue accent. Every visual element must either clarify structure, expose state, or support an action.

## Foundations

### Layout

- Design mobile-first in a single `max-w-md` column. Desktop only centers that column; it does not become a separate layout.
- Respect top, side, and bottom safe-area insets. This is mandatory for installed PWA use.
- Prefer generous vertical spacing and full-width horizontal rules over nested containers.
- Keep list content aligned to the same horizontal padding across screens.
- Use whitespace to separate concepts before adding another box or background.

### Typography

- Body: Noto Sans Variable (`font-sans`).
- Headings: Nunito Sans Variable (`font-heading`), normally semibold.
- Timers, counters, and aligned numeric data: monospace with `tabular-nums`.
- Product wordmark: uppercase, maximum weight, `-1px` letter spacing.
- Section labels and metadata use the editorial eyebrow style: `0.625rem`, semibold, uppercase, and wide tracking.
- Body copy stays neutral and highly legible. Muted text is for supporting information, never essential actions.

### Color

The light theme is the current product baseline:

- Background and surfaces are white.
- Typography uses warm near-black and neutral gray tokens.
- Borders are quiet hairlines.
- Primary ink blue: `oklch(0.42 0.055 245)`.
- Accent wash: `oklch(0.955 0.012 245)`.

Color is functional:

- Ink blue identifies navigation, progress, current state, and important numeric data.
- The accent wash communicates hover or selection without overpowering content.
- Destructive red is reserved for an active warning or destructive confirmation. Do not use it to advertise an infrequent action such as deleting a routine.
- Do not introduce decorative colors, gradients, or colored shadows.

### Shape and depth

- Prefer flat surfaces, square visual groupings, and hairline borders.
- Do not use shadows for ordinary hierarchy.
- Avoid stacking bordered cards inside bordered sections.
- Rounded controls may follow the shadcn radius tokens, but the page structure should remain editorial and restrained.

## Reusable Patterns

### Lists and selection rows

Routine and day lists are the same interaction pattern:

- A top rule followed by full-width rows with bottom rules.
- `px-4 py-5` content padding.
- Eyebrow, title, supporting metadata, and a right-aligned arrow.
- The whole content area is the trigger.
- Hover uses the accent background; it does not change the title color or move the arrow.
- The arrow stays vertically centered on the right.
- Current or recommended rows may add a slim primary left rule and a subtle accent wash.

Do not invent different list behavior for each screen.

### Action hierarchy

- One primary action per decision point.
- A full-width primary import button is appropriate only when there are no routines.
- Once routines exist, importing becomes a secondary action in the routines header menu.
- Rare or destructive actions belong in an overflow menu and use neutral presentation until the user selects them.
- Supporting actions such as `Ver técnica` and `Alternativas` use compact outline buttons and sit together.
- Ghost actions are for low-emphasis navigation such as `Volver`, `Salir`, or dismissing a flow.

### Overlays

- Use dropdown menus for short contextual action lists.
- Use a bottom sheet for substantial supporting content on mobile.
- Technique instructions live in a bottom sheet, not permanently in the workout flow.
- A sheet header stays visually separate from its internally scrolling body.
- Numbered instruction rows align their number and text on the same baseline.

### Icons

- Use the Lucide set unless the product gains a dedicated equipment icon system.
- Keep stroke weight, size, and alignment consistent.
- Icons support a recognizable action; they do not decorate headings or empty space.
- Icon-only controls always have an accessible name.

## Screen Decisions

### Home

- The Solorep wordmark anchors the page; the routines section is subordinate.
- Imported routines use editorial list rows rather than isolated floating cards.
- The routine overflow trigger is vertically centered within its row.
- Routine deletion is neutral and hidden in that overflow menu.
- The active-session prompt may be more prominent because resuming is the primary task.

### Day selection

- Reuse the home list row dimensions, hover, arrow placement, and typography.
- Mark the next day with a restrained status badge, primary left rule, and light accent wash.
- Do not turn the recommended day into a large primary button.

### Workout execution

- Keep the day, exercise name, set count, and overall progress at the top.
- Keep `Salir` at the top right, outside the primary action dock.
- Exercise media is frameless and has no redundant figure number or exercise-name caption.
- Place `Ver técnica` and `Alternativas` together above the media.
- The alternatives menu shows only choices other than the exercise currently displayed. When an alternative is active, the original exercise remains available so the swap is reversible.
- Weight, repetitions or duration, `Anterior`, and the next action live in a fixed bottom dock so scrolling never hides them.
- The dock respects safe areas and the page reserves enough bottom space to prevent covered content.

### Progress

- Progress is grouped by exercise slot.
- Each group contains one segment per set.
- Completed and current segments use the primary color; pending segments use the border color.
- Small gaps separate sets and larger gaps separate exercise groups.
- This communicates both position within an exercise and position within the session without extra copy.

### Timers and summary data

- Countdowns use `MM:SS`, monospace, and tabular numerals.
- Timer scale may be intentionally oversized; supporting labels remain quiet editorial eyebrows.
- Summary metrics use the same monospace numeric language and hairline-row structure.

## Illustration and media

The long-term illustration direction is monochrome anatomical or technical drawing: fine lines, subtle graphite-like shading, accurate proportions, and clean composition. It should feel educational, never cartoonish.

The current exercise GIF dataset is functional reference media, so it should be presented as lightly as possible:

- No frame, shadow, decorative background, figure number, or repeated caption.
- Preserve the full media width and natural breathing room.
- Never add color treatments that compete with the exercise itself.

## Accessibility and test contracts

Accessibility is part of implementation, not a styling option:

- Use semantic controls, visible focus states, associated labels, accessible names for icon-only actions, live regions for timers, and `role="alert"` for errors.
- Accessibility metadata must describe the interface correctly, but tests do not select elements through that metadata.
- Every DOM element selected by a test must expose a stable `data-test` attribute.
- Tests must verify behavior and state, never Tailwind classes or other CSS implementation details.
- Do not add tests whose only assertion is that an accessibility attribute exists.

## Review checklist

Before shipping a visual change, check:

- Does it improve hierarchy or merely add decoration?
- Is the accent color communicating a real state or action?
- Is there more than one competing primary action?
- Does it match the established list, overlay, and control patterns?
- Are essential workout controls visible without scrolling?
- Does it respect phone safe areas?
- Is destructive behavior quieter than daily behavior?
- Does it remain understandable without hover?
- Are test selectors explicit and independent of styling and accessibility metadata?
