import { Box } from "effect-boxes";
import { clean, type InventoryReview } from "../inventory.js";

export const reviewTabs = [
  "Overview",
  "Profiles",
  "Files",
  "Blockers",
] as const;
export type ReviewTab = (typeof reviewTabs)[number];
const paint = (value: string, code: string, styled: boolean) =>
  styled ? `\x1b[${code}m${value}\x1b[0m` : value;
const cells = (value: string) => Box.text(value).cols;
const label = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

// Wrap by terminal cells, preserving complete paths in the scrollable detail tabs.
function wrap(value: string, width: number) {
  const lines: string[] = [];
  let line = "",
    used = 0;
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(clean(value))) {
    const size = cells(segment);
    if (used + size > width && line) {
      lines.push(line);
      line = "";
      used = 0;
    }
    line += size > width ? "�" : segment;
    used += size > width ? 1 : size;
  }
  lines.push(line);
  return lines;
}
function borderBox(
  title: string,
  content: readonly string[],
  width: number,
  styled: boolean,
  ascii: boolean,
) {
  const chars = ascii
    ? { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" }
    : { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" };
  const titlePart = " " + (wrap(title, width - 6)[0] ?? "") + " ";
  const head =
    paint(chars.tl + chars.h, "90", styled) +
    paint(titlePart, "1", styled) +
    paint(
      chars.h.repeat(Math.max(0, width - 3 - cells(titlePart))) + chars.tr,
      "90",
      styled,
    );
  const lines = content.flatMap((value) => wrap(value, width - 4));
  return [
    head,
    ...lines.map(
      (value) =>
        paint(chars.v, "90", styled) +
        " " +
        value +
        " ".repeat(Math.max(0, width - 4 - cells(value))) +
        " " +
        paint(chars.v, "90", styled),
    ),
    paint(chars.bl + chars.h.repeat(width - 2) + chars.br, "90", styled),
  ];
}

export function reviewLayout(
  review: InventoryReview,
  {
    width,
    tab = "Overview",
    styled = false,
    ascii = false,
  }: { width: number; tab?: ReviewTab; styled?: boolean; ascii?: boolean },
) {
  const totalFiles = review.operations.length + review.noticeChanges.length;
  const badges = [
    "Overview",
    `Profiles ${review.profileChanges.length}`,
    `Files ${totalFiles}`,
    `Blockers ${review.blockers.length}`,
  ];
  const tabs: string[] = [];
  let nav = "",
    navWidth = 0;
  for (const [index, badge] of badges.entries()) {
    const active = reviewTabs[index] === tab;
    const text = active && !styled ? `[${badge}]` : ` ${badge} `;
    const size = cells(text),
      gap = navWidth ? 2 : 0;
    if (navWidth + gap + size > width) {
      tabs.push(nav);
      nav = "";
      navWidth = 0;
    }
    nav += (navWidth ? "  " : "") + paint(text, active ? "7" : "90", styled);
    navWidth += (navWidth ? 2 : 0) + size;
  }
  if (nav) tabs.push(nav);
  const summary = [
    label(review.profileChanges.length, "profile edit"),
    label(review.counts.adopt, "adoption"),
    label(review.counts.add, "install"),
    label(review.notices.length, "notice file"),
    label(review.blockers.length, "blocker"),
  ].join(" | ");
  const pinned = [...tabs, ...wrap(summary, width), ""];
  const marker = (enabled: boolean, required = false) =>
    enabled ? (required ? (ascii ? "o" : "○") : ascii ? "x" : "●") : " ";
  const profiles = review.profileChanges.map(
    (change) =>
      `${marker(change.action === "Enable")} ${change.action} ${change.name} in [${change.profile}]${change.external ? " (external; membership only)" : ""}`,
  );
  const dependencies = review.dependencyChanges.map(
    (change) =>
      `${marker(change.action === "Require", true)} ${change.action} ${change.name} in [${change.profile}]${change.action === "Require" ? ` (via ${change.requiredBy.join(", ")})` : " (no longer required)"}`,
  );
  const box = (title: string, lines: readonly string[]) =>
    borderBox(title, lines, width, styled, ascii);
  let body: string[];
  if (tab === "Overview") {
    const effects = [
      ...review.operations
        .filter((item) => item.action === "adopt")
        .map(
          (item) =>
            `adopt ${item.name} · keep existing files; record ownership`,
        ),
      ...review.noticeChanges.map(
        (item) =>
          `notice ${item.name} · add ${item.path.split(/[\\/]/).at(-1) ?? item.path}`,
      ),
      ...review.operations
        .filter((item) => item.action !== "adopt")
        .map(
          (item) =>
            `${item.action === "add" ? "install" : item.action} ${item.name} · ${item.action === "add" ? (item.existingMember ? "already enabled; add missing catalog files" : "add catalog files") : item.action === "remove" ? "remove unchanged owned files" : "update owned files to catalog"}`,
        ),
    ];
    body = [
      ...box(
        `Profile membership · ${label(profiles.length, "edit")}`,
        profiles.length || dependencies.length
          ? [...profiles, ...dependencies]
          : ["No membership changes."],
      ),
      "",
      ...box(
        "Local files & ownership",
        effects.length ? effects : ["No file or ownership changes proposed."],
      ),
      "",
      ...wrap(
        review.blockers.length
          ? `Blockers (${review.blockers.length}): ${review.blockers[0]}. Open Blockers for all unresolved work.`
          : "No blockers. Exact paths and aliases are in Files.",
        width,
      ).map((line) => paint(line, review.blockers.length ? "1" : "90", styled)),
    ];
  } else if (tab === "Profiles") {
    body = [
      ...box(
        `Draft profile membership · ${label(profiles.length, "edit")}`,
        profiles.length ? profiles : ["No explicit membership changes."],
      ),
      ...(dependencies.length
        ? [
            "",
            ...box(
              `Required dependencies · ${dependencies.length}`,
              dependencies,
            ),
          ]
        : []),
      ...(review.persistence.length
        ? ["", ...box("Save scope", review.persistence)]
        : []),
      "",
      ...wrap(
        "External memberships never grant file ownership. Only the current machine has file operations; the other profile is membership only.",
        width,
      ),
    ];
  } else if (tab === "Files") {
    body = [];
    for (const [action, title] of [
      ["adopt", "Adopt existing"],
      ["add", "Install missing"],
      ["update", "Update owned"],
      ["remove", "Remove owned"],
    ] as const) {
      if (review.counts[action])
        body.push(
          ...(body.length ? [""] : []),
          ...box(`${title} · ${review.counts[action]}`, review.groups[action]),
        );
    }
    if (review.notices.length)
      body.push(
        ...(body.length ? [""] : []),
        ...box(
          `Add notices · ${label(review.notices.length, "file")}`,
          review.notices,
        ),
      );
    if (!body.length)
      body = box("Local files & ownership", [
        "No file or ownership changes proposed.",
      ]);
    body.push(
      "",
      ...wrap(
        "External skills have no file operations. Owned skills outside the original local selection are retained.",
        width,
      ),
    );
  } else {
    body = box(
      `Blockers · ${review.blockers.length}`,
      review.blockers.length ? review.blockers : ["No blockers in this draft."],
    );
    if (review.blockers.length)
      body.push(
        "",
        ...wrap(
          "Resolve these differences before file management. Profile membership remains a draft. No automatic replacement or deletion is proposed.",
          width,
        ),
      );
  }
  return { pinned, body };
}
