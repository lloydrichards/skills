# Design System for HTML Reports

This is the shared visual and interaction language for self-contained HTML reports. It is intentionally independent of report subject and structure: consumers decide what the report says; this system decides how ordinary report content looks and behaves.

Use [report-scaffold.html](report-scaffold.html) as the implementation source. This document explains how to use and extend it.

Use [design-system.html](design-system.html) as the canonical rendered example when component choice, markup, composition, or expected appearance is unclear. It is a living catalog of semantic HTML, shared report primitives, interaction states, and styled native controls. Copy its demonstrated patterns rather than inventing local variants. Its `<style>` block must remain identical to `report-scaffold.html`; do not add catalog-only CSS that hides gaps in the foundation.

## Design intent

Help a technical reader move through three depths:

1. **Glance** — understand purpose, outcome, confidence, or open action before committing.
2. **Scan** — navigate by descriptive headings, concise claims, evidence states, and meaningful links.
3. **Inspect** — examine supporting details, code, figures, matrices, and references without losing context.

The visual character is a quiet technical document, not an application dashboard. Content carries the weight. Whitespace and rules establish structure. Color is reserved for links, focus, and semantic states.

## System layers

The scaffold implements three token layers, grouped in that order in `:root`:

1. **Palette tokens** contain literal light/dark colors. Nothing else may contain raw colors.
2. **Semantic tokens** describe roles such as page surface, primary text, subtle border, verified state, and risk state.
3. **Component tokens** adapt semantic roles for shared panels, controls, and focus indicators. Report-specific extensions add their own component tokens before their CSS.

Layout tokens define the reading measure, wide measure, typography, radii, and spacing rhythm. Type tokens are named for roles—display, heading, body, label, and code—so size, weight, family, tracking, and line height remain a coherent choice. Components and extensions use these tokens rather than inventing local values.

## Typography language

HTML semantics and visual typography are separate decisions. Choose `h1` through `h6` from the document outline, then add a type class for the visual role. Never choose a heading rank because it has the desired size, and never omit a heading rank to make text look smaller.

| Class | Purpose |
| --- | --- |
| `.display-1` | The single primary report title. |
| `.display-2` | A compact title in a dense or secondary context. Use rarely. |
| `.heading-1` | A major report section. |
| `.heading-2` | A subsection within a major section. |
| `.heading-3` | A minor local heading or compact group label. |
| `.body-1` | Normal reading text; this is also the body default, so it rarely needs to be added explicitly. |
| `.body-2` | Supporting copy, captions, and compact table content. Use sparingly. |
| `.label-1` | Short metadata, categories, and state labels. Never use for prose. |
| `.code-1` | Compact technical text or code-like labels. |

The vocabulary is intentionally shorter than the six HTML heading ranks. Deep document structure may reuse a quieter heading role: for example, an `h4` and `h5` can both use `.heading-3` while retaining distinct semantic ranks. Conversely, `<h2 class="display-2">` is valid when a level-two heading needs title-like emphasis. Unclassed headings inherit the surrounding typography, making missing visual intent obvious instead of silently coupling semantics to presentation.

Component classes such as `.lede`, `.eyebrow`, `.meta`, and `.state` remain meaning-specific conveniences. Their typography is built from the same role tokens; use the general type classes only when no component meaning applies.

## Base elements

The scaffold styles the elements a report should normally need:

- `body`, `main`, `header`, `section`, `footer`, and `nav`;
- heading elements, paragraphs, lists, description lists, and horizontal rules;
- links, buttons, inline code, code blocks, blockquotes, tables, figures, and captions;
- `details` and `summary`;
- keyboard focus, target sizing, reduced motion, increased and forced contrast, narrow screens, and print.

Use semantic HTML first, then apply the shared type role to headings. A consuming skill should be able to write prose, lists, tables, figures, and code without supplying any CSS.

### Blockquotes

Use `blockquote` for material quoted from another source or a deliberately distinct quoted voice. Attribute the source when known with a nearby `cite` or source link. Do not use a blockquote as a decorative pull quote, recommendation box, or substitute for a callout. State material conclusions in the report's own voice even when a quotation supports them.

### Lists and descriptions

Use `ul` for peer items, `ol` when sequence or priority matters, and `dl` for term/value or label/explanation relationships. Keep items grammatically parallel, introduce a list when its purpose is not obvious, and avoid deep nesting. Do not use lists to simulate tables or layout columns.

### Tables

Use a table only for genuinely tabular relationships. Introduce its purpose in prose, include a descriptive `caption`, and identify headers with `th` plus `scope="col"` or `scope="row"`. Prefer simple tables; split complex multi-level structures when possible and never use tables for page layout. State the important takeaway outside the table so readers do not have to infer the conclusion from cells alone.

Wrap a wide table in `.table-scroll`. If the wrapper needs keyboard focus for compatibility, use `tabindex="0"`, `role="region"`, and an accessible name that describes the table—not a generic label such as “scrollable content.”

## Shared components

Use these only when their meaning fits.

### Report header

`report-header` contains an optional `.eyebrow`, one `<h1 class="display-1">`, a concise `.lede`, and optional `.meta` items. It orients the reader; it is not a hero banner.

### Orientation strip

`orientation` contains two or three `summary-card` items for facts that materially change how the report should be read: outcome, confidence, scope, decision, or open check. Do not turn it into a metric dashboard.

### On-this-page navigation

`toc` is optional. Use it when the page has at least three substantial sections or when readers are likely to jump rather than read linearly. Link text must match or meaningfully summarize section headings.

### Callouts

`callout` highlights a bounded recommendation, note, verified result, caution, or risk. The visible label must carry the meaning; color alone never does.

### Evidence states

`state` labels a claim as `verified`, `inferred`, `open`, or `risk`. State labels describe epistemic posture, not importance.

The evidence vocabulary maps onto semantic color roles: verified → success, inferred → information, open → warning, and risk → danger. Each role has separate foreground, surface, and border-capable tokens. Keep the visible state label; color reinforces meaning but never carries it alone.

### Semantic summary cards

Use `summary-card info`, `summary-card success`, `summary-card warning`, or `summary-card error` when the orientation fact itself has a semantic state. Neutral summary cards remain the default. Do not use colored cards merely to make the opening busier.

### Choose a container

| Reader need | Pattern |
| --- | --- |
| A small number of report-level facts that change how the report is read | Neutral `summary-card` in `orientation` |
| An orientation fact with an outcome or operational condition | Semantic `summary-card` |
| A bounded message that must stand apart from surrounding reasoning | `callout` |
| The support status of a claim | `state` evidence label, optionally inside a matching callout |
| Ordinary supporting content | Prose, list, table, or figure without an extra container |

Outcome states and evidence states answer different questions. `success`, `warning`, and `error` describe a condition or result; `verified`, `inferred`, `open`, and `risk` describe the report's epistemic posture. Do not substitute one vocabulary for the other.

### Figures

`figure` groups one coherent diagram, image, annotated example, or visual comparison with its explanation. Every figure needs a `figcaption` that states its takeaway, not merely its format. Give informative images useful `alt` text and decorative images empty `alt`. For inline SVG, provide a `title` and, when the visual needs fuller explanation, a `desc` connected with `aria-labelledby`.

A figure must not be the only location of a material conclusion or underlying values. Provide a nearby textual explanation and use a table or list when readers need exact data. Prefer prose or a compact table when the relationship is not materially easier to understand visually.

### Progressive disclosure

Use native `details` for supporting implementation, full matrices, secondary figures, glossary entries, or reference lists. Keep the claim, material evidence, risk, limitation, conclusion, and requested action visible.

### Source links

`source-ref` is an action-oriented link beside the claim it supports. Prefer immutable repository revisions and precise line ranges. Link text should explain what the reader will inspect.

### Native controls

Use form controls only when the report has a genuine interaction such as filtering, configuring a comparison, entering simulator values, or recording a decision. The scaffold provides a restrained baseline for text-like inputs, selects, textareas, fieldsets, disabled and invalid states, checkboxes, radios, ranges, progress, and meter elements. Preserve native semantics and useful platform behavior. Use `accent-color` as progressive enhancement; do not remove native appearance broadly.

- Give every control a persistent `label`; a placeholder is an example, not a label.
- Group related checkboxes or radios in `fieldset` with a descriptive `legend`.
- Choose the correct `type` and provide useful `name`, `autocomplete`, `inputmode`, `required`, and constraint attributes when applicable.
- Connect hint and error text with `aria-describedby`. Set `aria-invalid="true"` only while the value is invalid, explain how to correct it, and preserve entered values after validation.
- Give every button an explicit `type`. Do not make a non-submit action a submit button.
- Use `progress` for task completion and `meter` for a scalar value within a known range; give either a visible label.
- Keep the interaction keyboard-operable and ensure a change does not unexpectedly move focus or erase context.

Canonical field pattern:

```html
<p>
  <label for="scope">Report scope</label><br />
  <small id="scope-hint">Name the system or decision being reviewed.</small><br />
  <input id="scope" name="scope" type="text"
         aria-describedby="scope-hint" required />
</p>
```

See the native-controls section of [design-system.html](design-system.html) for grouped controls, invalid and disabled states, range input, progress, meter, and button examples.

### Data colors

The six `--color-data-*` tokens form a categorical sequence for unrelated groups; they do not encode order, magnitude, or divergence. Use semantic state colors for status and introduce sequential or diverging tokens only as a justified extension. Use one data color for a single series and add colors only to distinguish categories. Keep each category-to-color mapping stable within a report, follow token order, and limit a figure to five or six categories.

Place text beside rather than on color marks unless contrast has been verified. Separate adjacent marks and repeat meaning with direct labels, shapes, line styles, or patterns. Provide a textual takeaway and underlying values for every visualization.

## Extension rules

A report-specific extension may add a domain visualization, comparison layout, simulator, or interaction when existing primitives cannot express the idea.

1. Reuse shared spacing, type, surface, text, border, and state tokens.
2. Add semantic or component tokens before adding component rules.
3. Keep raw color literals confined to the palette section in the scaffold.
4. Do not redefine base elements or shared classes.
5. Name classes for meaning, not appearance: `dependency-map`, not `blue-box`.
6. Keep DOM order equal to reading order.
7. Provide a nonvisual explanation for information carried by a diagram or interaction.
8. If the extension would benefit multiple consumers, promote it to the shared scaffold.

Prefer logical properties (`inline-size`, `padding-inline`, `inset-block-start`) so layout remains robust across writing modes. Use modern platform features progressively: unsupported preference media queries should leave the baseline intact.

## Usage rules

- Use one unique `h1`, logical heading ranks, and a type class that describes each heading's visual role.
- Do not use `.display-*` or `.heading-*` on non-heading content except in a design-system specimen. This preserves a reliable visual cue for navigation.
- Use sentence-case, descriptive headings. Task sections begin with a verb; conceptual sections use noun phrases.
- Keep rounded containers sparse. Cards group content; they do not decorate every paragraph.
- Use monospace for code, metadata, source actions, and compact evidence labels—not long prose.
- Keep tables for genuinely tabular relationships and follow the table rules in Base elements.
- Use figures when a relationship is materially easier to understand visually. Otherwise prefer prose or a compact list.
- Avoid directional references such as “above” or “on the right”; name the section or figure.
- Do not require a table of contents, orientation strip, theme control, quiz, or diagram. The report job decides.

## Consumer checklist

Before delivery, confirm:

- the report began from the shared scaffold;
- unused optional components were removed;
- local CSS does not restyle standard elements or duplicate shared components;
- headings, landmarks, and DOM order reflect the information hierarchy;
- all controls work with a keyboard and have accessible names;
- skip navigation moves focus to the main report, and focus indicators remain visible and unobscured;
- state is not communicated by color alone;
- the report works at 320px, in light and dark themes, with reduced motion, increased/forced contrast, and in print;
- collapsed content expands in print;
- external dependencies are absent or explicitly approved and disclosed.
