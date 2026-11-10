# Third-Party Notices

## Learn Skill

`skills/learn` is a clean-break redesign of Matt Pocock's stateful `teach` skill.

Original skill: <https://github.com/mattpocock/skills/tree/main/skills/productivity/teach>

The redesign retains the original ideas of one mission-driven teaching workspace, trusted resources, durable learning records, short lessons, references, retrieval practice, spacing, interleaving, feedback, and reusable assets. It replaces the original workspace and lesson contract with explicit capability evidence, routed learning jobs, risk-based research, learner-controlled local evidence handoff, report-builder integration, and two reusable progressive-enhancement primitives.

## Explain Diff Skill

`skills/explain-diff` is adapted from Geoffrey Litt's `/explain-diff` skill, which he presented in his talk “Understanding is the new bottleneck” at AI Engineer World’s Fair 2026.

Original skill: <https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524>

Talk write-up: <https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html>

The version in this repository retains the original skill's central teaching sequence (background, intuition, code walkthrough, and quiz), concrete toy examples, diagram guidance, dated standalone HTML output, and prose-style direction. It has been substantially expanded and modified with reader contracts, system-level diff investigation, explicit mental-model construction, worked examples and transfer prompts, evidence and inference rules, behavior/risk/test coverage, stronger quiz design, accessibility and offline-output requirements, Mermaid pre-rendering, validation checks, and integration with the shared report-builder scaffold and design system.

## Effect Skill

`skills/effect` began as the Effect skill from [kitlangton/skills](https://github.com/kitlangton/skills) and has been modified and expanded in this repository.

Source: <https://github.com/kitlangton/skills/tree/main/skills/effect>

The upstream skill is licensed under the MIT License. Its required notice is reproduced below.

```text
MIT License

Copyright (c) 2026 Kit Langton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Shared-skills migration additions

Third-party licenses override the collection MIT license for their original material. This proposal does not relicense third-party code. Existing embedded and vendored notices are retained. Additional upstream root notices are retained under `licenses/<skill>/` and copied into maintained skill folders as `UPSTREAM-*`. Manifest-only sources carry their upstream root notices into generated installations.

Maintained adaptations and metadata overlays:

- `deslop`: millionco/react-doctor, comparison baseline f1913f27f5b0ae895119dc9b73102bdebc7bbc14. Local rewrite and added guidance.
- `unslop`: backnotprop/pstack, comparison baseline 55bfdc262dd7f99254d19b53a96cf1dfb24c213b. Local terminology examples.
- `engineering-principles`: backnotprop/pstack, explicitly recorded revision 157aae39a733135e93d8b5b19ff62c6a84b0ad56. Custom wrapper, repackaged references and relative-link adjustments. See LICENSE.upstream.
- `install-anti-slop`: dmmulroy/anti-slop, comparison baseline d2a9aea3b896ffcb291a85f2c1301aa2543ad8c8. Modified spacing rules and vendored adapter. Nested ESLint Stylistic licenses and UPSTREAM.md remain applicable.
- `skill-creator`: anthropics/skills, comparison baseline b9e19e6f44773509fbdd7001d77ff41a49a486c1. HTML preview changes and Codex metadata. Its LICENSE.txt remains authoritative.
- `skill-doctor`: warpdotdev/common-skills, comparison baseline 7c4eb852de8d7c3e68c81802e1c59db9a611f914. Codex turn-counting fix, report changes and tests.
- `rubber-duck`: elliotjlt/claude-skill-potions, comparison baseline 7050028afe96e28071548b9e85265cce030cb8c8. Added Codex metadata.

Exact upstream paths, immutable commits, file hashes, executable flags and baseline qualifications for manifest-only installations are in sources.lock.json. A comparison baseline is not proof of an original installation revision. Candidate snapshots are outside this public source tree and receive no new ownership or license claim here.
