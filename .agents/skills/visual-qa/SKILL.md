---
name: visual-qa
description: Use when reviewing, refining or finishing a rendered website, UI screen or PowerPoint slides. Requires visual screenshots/renders when available, diagnoses layout/typography/spacing defects, applies fixes and checks again. Do not use for purely backend tasks.
---

# Visual QA Loop

## Inputs
Use the implementation, an actual rendered screenshot or slide image, any provided visual reference, viewport/slide dimensions and user requirements. If no visual tool is available, do a code/structure audit but explicitly disclose that visual validation was not performed.

## Procedure
1. Capture or inspect the real rendered result. For UI, check desktop, mobile and important interaction states. For slides, inspect montage plus every page with dense content.
2. Identify the most impactful defects in this order: missing/false content, unreadability, overflow/cropping, unclear hierarchy, poor composition, inconsistent design, weak details.
3. Log each defect with location and a concrete change. Avoid vague commands such as 'make it premium'.
4. Apply fixes to the source, not only to exported screenshots. Re-run rendering and inspect the result.
5. Aim for two meaningful passes when available. Do not invent tool execution.

## Quality rubric (0–2 each, used as internal diagnosis)
- Hierarchy: obvious primary focal point and reading order
- Typography: appropriate scale, line length, line height and font consistency
- Layout: grid, spacing, alignment and purposeful negative space
- Contrast and accessibility: readable text and discoverable controls
- Content fidelity: no fake data, missing information or unintended edits
- Consistency: colors, margins, components and visual motifs remain coherent
- Context fit: style supports the audience and task rather than a generic template

## Output
A short before/after summary, unresolved issues and the *actual* screenshots or render artifacts inspected, if available. Do not use scores as unsupported marketing claims.
