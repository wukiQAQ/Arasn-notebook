# Design-First Agent Rules (UI + PPT)

## Mission
For user-facing UI and slide decks, prioritize visual quality, usability, and correct content, not merely a successful build or generated file.

## Scope and precedence
- Inspect the project and follow the user's product requirements, brand guidelines, reference assets, and existing technical constraints first.
- Use any installed `frontend-design` skill for UI concepting; `web-design-guidelines` for UI audit; `slides` for editable PowerPoint authoring and validation.
- Use the local `visual-qa` and `ppt-art-direction` skills for visual quality control and slide art direction.
- If a skill or visual tool is unavailable in this harness, say so. Never claim to have reviewed a screenshot or slide rendering that was not actually produced.

## Before UI implementation
1. Define users, primary task, content priority, and constraints.
2. Explore 2–3 **genuinely different** design directions; specify layout structure, typography, palette, spacing, imagery and motion. Choose one direction with reasons unless the user requests approval.
3. Write a compact design brief and design tokens. Do not automatically use gradients, purple SaaS styling, rounded-card grids or generic icon rows; use them only if the brief justifies them.
4. Implement within the project's existing stack and component conventions. Do not add fictitious claims or placeholder metrics as real facts.

## UI visual feedback
1. Run the application when possible; inspect real browser screenshots at desktop (~1440px) and mobile (~390px), plus an intermediate width when needed.
2. Compare to the design brief or supplied reference; inspect hierarchy, spacing, typography, cropping, contrast, content overflow, alignment, navigation and interactions.
3. Fix the three most consequential visible defects; capture and inspect again. Repeat at least twice when the environment supports visual review and the task merits it.
4. Test primary interactions, keyboard focus, responsive wrapping and obvious errors. State any checks that could not be run.

## Before slide implementation
1. Clarify intended audience, message, 16:9 or required format, output editability, and branding from supplied context.
2. Outline the deck and define a one-sentence takeaway for every slide. Vary the slide's visual archetype based on content: statement, comparison, process, timeline, data visualization, case study or summary.
3. Create a shared slide design system: font family/fallback, type scale, margins, grid, palette, chart language and image treatment.
4. Prefer editable PowerPoint text/shapes/charts when a .pptx is requested. Do not replace a requested editable deck with screenshot-only slides.

## Slide visual feedback
1. Render every slide to an image, inspect a full-deck montage and individual dense slides; check clipping, overlap, font replacement, contrast, visual consistency, and reading order.
2. Run overflow checks when available. Correct issues and re-render.
3. Deliver the requested .pptx and editable source when possible; accurately describe limits or unmet checks.

## Completion requirements
- Briefly report the chosen visual direction, concrete changes, and verification performed.
- Avoid claiming subjective perfect scores (e.g. '10/10') without a transparent evaluation process.
