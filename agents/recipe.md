# Recipe Flowchart Language — Agent Reference

> **Inspiration**: The flowchart table layout is based on the recipe diagrams
> pioneered by [cookingforengineers.com](https://www.cookingforengineers.com/),
> where ingredients flow left→right through action steps into finishing steps.

This document describes the recipe dialect used by the Recipe Flowchart app.
When a user asks you to write a recipe in this format, produce a Markdown file
following the rules below. The app parses it and renders a flowchart-style grid
table where ingredients flow left→right through action steps.

---

## Structure overview

```
# Recipe Title

> Prep step 1
> Prep step 2

N. final action
N-1. earlier action
N-2. even earlier action
plain ingredient line
plain ingredient line

---
Finishing step A
Finishing step B
```

---

## Elements

### `# Title` — Recipe title
One `#` heading. Appears as the top-most row of the rendered table, spanning
the full width.

```
# Banana Nut Bread (about 10 servings)
```

---

### `> Prep step` — Global preparation notes
Blockquote lines. Each line becomes a full-width row above the ingredient grid.
Use for oven temperature, pan preparation, etc.

```
> Butter and flour a loaf pan
> Preheat oven to 350°F (170°C)
```

Multiple `>` lines produce multiple rows.

---

### `N. action` — Action nodes (the flowchart steps)
Lines starting with a number and a dot define action columns.

**Higher N = closer to the final dish = rightward in the table.**
**Lower N = earlier in cooking = leftward (closer to raw ingredients).**

Think of N as the cooking-order step number: you melt butter first (low N),
fold everything together last (high N).

An `N.` node is automatically a child of the most recent line with a higher
number above it. You never need to indent — the number encodes the tree.

```
4. fold in
3. mix
2. mix
1. melt
```

This produces four nested action columns: `melt` → `mix` → `mix` → `fold in`.

Numbers do not need to be consecutive — any values work as long as the relative
ordering is preserved. `2. melt`, `5. mix`, `10. fold in` is equivalent to
`1. melt`, `2. mix`, `3. fold in`.

**Line breaks inside an action label** use `\n` or `<br/>`.
Each break adds a new vertical text column inside the cell (making it wider,
not taller).

---

### Plain paragraph lines — Ingredients (leaf nodes)
Any plain text line (not a heading, not a blockquote, not a numbered line)
is an **ingredient**. It belongs to the most recent `N.` action above it.

```
2. mix
1. melt
115 g unsalted butter
```

Here `115 g unsalted butter` belongs to `1. melt` (the nearest action above it).

### `N. ingredient` — Ingredients with explicit parent
When an ingredient line starts with a number and a dot, the number specifies
which action it belongs to. The parser pops any open steps with a smaller number,
then attaches the ingredient to the step that matches.

```
2. mix
1. melt
1. 115 g unsalted butter   ← belongs to 1. melt
2. 200 g sugar             ← pops 1. melt, belongs to 2. mix
2. 2.5 mL vanilla extract  ← also belongs to 2. mix
```

Use this when an ingredient goes directly into an ancestor step without
passing through the current innermost step.

**Inline prep label** — optional prefix `verb: ingredient`:
```
melt: 4 oz (115 g) unsalted butter
lightly beat: 2 large eggs
```
The verb (up to ~20 characters, letters and spaces only) is rendered in italics.
Omit it for plain ingredients.

Multiple ingredient lines under the same action are siblings — they each occupy
one row, and the action cell spans all of them.

---

### `---` + plain lines — Finishing steps
A `---` separator marks the start of the finishing steps section.
Each non-empty line after `---` becomes a narrow column on the **right** edge
of the table, spanning all body rows. Use for sequential post-mixing steps
(bake, cool, serve).

```
---
bake 350°F (170°C)\n30 to 40 min
cool 10 min. in pan
cool on wire rack
```

Use `\n` or `<br/>` to break a long finishing step into multiple lines (produces
a slightly wider cell rather than a taller table).

---

## How the grid is built

The app calculates:

- **Rowspan** of an action = number of leaf ingredients in its subtree.
- **Colspan** of a leaf = how many action columns it must skip to reach its
  parent (leaves that are direct children of a high-N root span multiple columns).
- **Column order**: ingredients on the left, action columns increasing rightward
  by N value, finishing steps on the far right.

The rendered table therefore reads left → right: ingredients → sub-actions →
root action → finishing steps.

---

## Complete example

```markdown
# Brownie (20×20 cm pan)

> Butter and flour a 20×20 cm pan
> Preheat oven to 170°C

4. fold in
3. mix
2. mix
1. melt
1. 115 g unsalted butter
2. 200 g sugar
2. 2.5 mL vanilla extract
2. 60 mL fresh brewed espresso
3. lightly beat: 2 large eggs
4. 80 g all-purpose flour
4. 80 g Hershey's cocoa powder
4. 1.3 g baking soda
4. 1.5 g table salt

---
bake 170°C\n30 to 40 min
```

The tree this encodes:
- `4. fold in` → root action, children: outer-mix + dry ingredients
- `3. mix` (outer) → child of fold-in, children: inner-mix + eggs
- `2. mix` (inner) → child of outer-mix, children: melt + sugar + vanilla + espresso
- `1. melt` → child of inner-mix, children: butter
- `2. sugar/vanilla/espresso` → siblings of melt, direct children of inner-mix
- `3. eggs` → sibling of inner-mix, direct child of outer-mix
- `4. flour/cocoa/…` → siblings of outer-mix, direct children of fold-in

This renders as:

```
┌──────────────────────────────────────────────────────────┐
│                  Brownie (20×20 cm pan)                  │
├──────────────────────────────────────────────────────────┤
│              Butter and flour a 20×20 cm pan             │
├──────────────────────────────────────────────────────────┤
│                  Preheat oven to 170°C                   │
├──────────────────────┬──────┬─────┬─────┬────────┬──────┤
│ 115 g butter         │ melt │     │     │        │      │
├──────────────────────┴──────┤ mix │     │        │ bake │
│ 200 g sugar                 │     │     │        │ 170° │
├─────────────────────────────┤     │ mix │ fold   │  30- │
│ 2.5 mL vanilla extract      │     │     │   in   │  40m │
├─────────────────────────────┤     │     │        │      │
│ 60 mL espresso              │     │     │        │      │
├───────────────────────────────────┤     │        │      │
│ lightly beat: 2 large eggs        │     │        │      │
├─────────────────────────────────────────┤        │      │
│ 80 g all-purpose flour                  │        │      │
├─────────────────────────────────────────┤        │      │
│ 80 g Hershey's cocoa powder             │        │      │
├─────────────────────────────────────────┤        │      │
│ 1.3 g baking soda                       │        │      │
├─────────────────────────────────────────┤        │      │
│ 1.5 g table salt                        │        │      │
└─────────────────────────────────────────┴────────┴──────┘
```

Key rowspans: melt=1, inner-mix=4, outer-mix=5, fold-in=9.

---

## Tips for agents

- Use realistic quantities with both volume and weight when known.
- Choose N values that match cooking order: lowest N = first thing you do,
  highest N = the final combining step.
- Numbers don't need to be consecutive; use whatever values feel natural.
- Finishing steps (after `---`) should be sequential and irreversible
  (bake → cool → serve). Don't put mixing steps there.
- Keep action node labels short (1–3 words); they are displayed rotated in a
  narrow column.
- If a step has only one ingredient, it still works fine as a single-row action.
- The `\n` line-break trick is useful for finish steps like temperature + time
  that would otherwise make the table very tall.
