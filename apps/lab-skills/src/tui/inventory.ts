import { NodeTerminal } from "@effect/platform-node";
import {
  Config,
  Console,
  Effect,
  Layer,
  Option,
  Queue,
  Stdio,
  Terminal,
} from "effect";
import {
  prepareInventory,
  applyInventory,
  type PreparedInventory,
} from "../inventory-live.js";
import type { Environment, Flags } from "../config.js";
import type { Result } from "../model.js";
import {
  collectInventory,
  comparisonLabel,
  enablementPreview,
  clean,
  inventoryRows,
  membership,
  buildInventoryReview,
  toggleMembership,
  type InventoryModel,
  type Profile,
} from "../inventory.js";

import {
  reviewLayout,
  reviewTabs,
  type ReviewTab,
} from "./inventory-review.js";

export const inventoryTerminal = Layer.effect(
  Terminal.Terminal,
  NodeTerminal.make(
    (input) => input.key.ctrl && ["c", "d"].includes(input.key.name),
  ),
);

const clip = (value: string, width: number) => {
  const text = clean(value);
  return text.length <= width
    ? text
    : text.slice(0, Math.max(0, width - 1)) + "…";
};
export const wideInventoryWidth = 118;
export function inventoryTable(
  model: InventoryModel,
  width: number,
  ascii = false,
  focus = "",
  query = "",
  filter = "all",
  styled = false,
) {
  const rows = inventoryRows(model).filter(
    (row) =>
      `${row.name} ${row.description} ${row.status} ${row.proposed} ${row.profiles.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "changes" && row.pending) ||
        (filter === "installed" && row.copies.length) ||
        (filter === "available" && !row.copies.length)),
  );
  const nameWidth = Math.min(32, Math.max(18, width - 104));
  const profilesFor = (row: (typeof rows)[number]) =>
    row.profiles
      .map(
        (profile) =>
          `[${profile}${row.addedProfiles.includes(profile) ? "+" : ""}]`,
      )
      .join(" ") || "-";
  const profileWidth = Math.max(
    9,
    ...rows.map((row) => profilesFor(row).length),
  );
  const descWidth = Math.max(0, width - 57 - nameWidth - profileWidth);
  const header =
    width >= wideInventoryWidth
      ? "  On  " +
        "Name".padEnd(nameWidth) +
        "  " +
        "Status".padEnd(15) +
        "  " +
        "Plan".padEnd(8) +
        "  " +
        "Description".padEnd(descWidth) +
        "  Current → Target    Profile"
      : "  On  Name / Status / Plan / Description / Change / Profile";
  const lines = rows.map((row) => {
    // Membership remains visible even when a warning makes the skill unavailable.
    const marker = !row.enabled
      ? " "
      : row.direct
        ? ascii
          ? "x"
          : "●"
        : ascii
          ? "o"
          : "○";
    const prefix = `${row.name === focus ? (ascii ? ">" : "›") : " "} ${marker}   `;
    const profile = profilesFor(row);
    const target =
      row.proposed === "remove" ? "-" : row.target.slice(0, 7) || "-";
    const change =
      row.current === target ? target : row.current + " → " + target;
    const paint = (value: string, code: string) =>
      styled && row.name !== focus ? `\x1b[${code}m${value}\x1b[0m` : value;
    const warning = [
      "local edits",
      "blocked",
      "changed content",
      "extra files",
      "missing files",
      "mixed",
      "unknown",
      "no catalog",
    ].includes(row.status);
    const name = clip(row.name, nameWidth).padEnd(nameWidth);
    const status = row.status.padEnd(15),
      plan = (row.proposed || "-").padEnd(8);
    const description =
      row.description || "No frontmatter description available.";
    const value =
      width >= wideInventoryWidth
        ? prefix +
          paint(name, row.enabled ? "1" : "0") +
          "  " +
          paint(status, warning ? "1" : "0") +
          "  " +
          paint(plan, row.proposed ? "1" : "90") +
          "  " +
          paint(clip(description, descWidth).padEnd(descWidth), "90") +
          "  " +
          paint(change.padEnd(18), "90") +
          "  " +
          profile
        : `${clip(prefix + row.name, width)}\n      ${clip(row.status + " | plan: " + (row.proposed || "-"), width - 6)}\n      ${paint(clip(description, width - 6), "90")}\n      ${clip(change + " " + profile, width - 6)}`;
    return { name: row.name, value };
  });
  return { header, lines, rows };
}

export const runInventory = Effect.fn("Inventory.run")(function* (
  root: string,
  flags: Flags,
  environment: Environment,
) {
  let model = yield* collectInventory(root, flags, environment);
  const stdio = yield* Stdio.Stdio,
    terminal = yield* Terminal.Terminal;
  const term = yield* Config.String("TERM").pipe(Config.withDefault(""));
  const noColor = yield* Config.String("NO_COLOR").pipe(Config.withDefault(""));
  const styling = noColor.length === 0 && term !== "dumb";
  const paint = (text: string, code: string) =>
    styling ? `\x1b[${code}m${text}\x1b[0m` : text;
  const interactive =
    (yield* stdio.stdinIsTerminal) &&
    (yield* stdio.stdoutIsTerminal) &&
    term !== "dumb";
  const active = model.activeProfile ?? "client";
  let prepared: PreparedInventory | undefined;
  let confirming = false;
  const scope = `REAL INVENTORY | ${flags.dryRun ? "DRY RUN" : "LIVE"} | ${active} <- ${clean(model.seed)}`;
  if (!interactive) {
    const table = inventoryTable(model, 120, flags.ascii);
    yield* Console.log(
      [
        `lab-skills inventory [${active}]`,
        scope,
        "",
        table.header,
        ...table.lines.map((line) => line.value),
        "",
        ...model.diagnostics.map((item) => "Warning: " + clean(item)),
        flags.dryRun
          ? "Dry run only. Installation, removal, adoption and configuration writes are disabled."
          : "Read-only output. Open in a terminal to review, save profiles and apply local files.",
      ].join("\n"),
    );
  } else
    yield* Effect.scoped(
      Effect.gen(function* () {
        const input = yield* terminal.readInput;
        yield* Effect.acquireRelease(
          terminal.display("\x1b[?1049h\x1b[?25l").pipe(Effect.orDie),
          () =>
            terminal.display("\x1b[0m\x1b[?25h\x1b[?1049l").pipe(Effect.orDie),
        );
        let focus = inventoryRows(model)[0]?.name ?? "",
          query = "",
          search = false,
          searchBackup = "",
          mode: "list" | "detail" | "review" | "help" = "list",
          reviewTab: ReviewTab = "Overview",
          profileMode = false,
          profile: Profile = active,
          filter = "all",
          top = 0,
          message = "";
        const filters = ["all", "changes", "installed", "available"];
        while (true) {
          const width = Math.max(1, (yield* terminal.columns) - 1),
            height = yield* terminal.rows;
          let table = inventoryTable(
            model,
            width,
            flags.ascii,
            focus,
            query,
            filter,
            styling,
          );
          if (!table.rows.some((row) => row.name === focus))
            focus = table.rows[0]?.name ?? "";
          table = inventoryTable(
            model,
            width,
            flags.ascii,
            focus,
            query,
            filter,
            styling,
          );
          const row = model.skills[focus];
          const edits = (["client", "home-lab"] as const).reduce(
            (n, key) =>
              n +
              model.draft[key].filter(
                (name) => !model.original[key].includes(name),
              ).length +
              model.original[key].filter(
                (name) => !model.draft[key].includes(name),
              ).length,
            0,
          );
          const header = [
            paint(
              `lab-skills  ${mode === "review" ? "review" : "inventory"}  [${active}]`,
              "1",
            ),
            paint(scope, "90"),
            mode === "review"
              ? "Reviewing all draft changes | Read-only"
              : `${membership(model, active).size} enabled | ${edits} profile edits | ${table.rows.length} skills | ${filter}`,
            "",
          ];
          let hint = "Space on/off   p profiles   d details   Enter review",
            context = "",
            pinned: string[] = [],
            body: string[];
          if (mode === "list") {
            pinned = [paint(table.header, "90")];
            if (profileMode) {
              const entry = membership(model, profile).get(focus);
              pinned.push(
                paint(
                  "Profile: " +
                    (["client", "home-lab"] as const)
                      .map((key) =>
                        key === profile ? `< ${key} >` : `  ${key}  `,
                      )
                      .join("   ") +
                    ` | ${entry ? (entry.direct ? "enabled" : "required") : "disabled"}`,
                  "1",
                ),
              );
              hint = "Left/Right profile   Space on/off   p/Esc done";
              context =
                profile === "home-lab"
                  ? (enablementPreview(model, focus, profile)[0] ??
                    "Home-lab draft only.")
                  : (enablementPreview(model, focus)[0] ??
                    "Editing the local client draft.");
            } else
              context =
                enablementPreview(model, focus)[0] ?? "No skill selected.";
            body = table.lines
              .flatMap((line) =>
                line.value
                  .split("\n")
                  .map((text) => ({ name: line.name, text })),
              )
              .map((item) =>
                item.name === focus ? paint(item.text, "7") : item.text,
              );
            const rowHeight = width < wideInventoryWidth ? 4 : 1,
              index =
                table.rows.findIndex((item) => item.name === focus) * rowHeight;
            const cap = Math.max(1, height - header.length - pinned.length - 5);
            if (index < top) top = Math.max(0, index);
            if (index + rowHeight > top + cap)
              top = Math.max(0, index + rowHeight - cap);
          } else if (mode === "detail") {
            body = row
              ? [
                  row.name,
                  "",
                  row.description || "No frontmatter description available.",
                  `Description: ${row.descriptionSource}`,
                  `Requires: ${row.dependencies.join(", ") || "-"}`,
                  "",
                  `If enabled in [${active}]`,
                  ...enablementPreview(model, row.name),
                  "",
                  "File comparison by installed location",
                  ...row.copies.flatMap((copy) => [
                    `Installed: ${copy.path}`,
                    `Physical: ${copy.physical}`,
                    `Comparison: ${comparisonLabel(copy)}${copy.edited ? "; owned files edited" : ""}`,
                    ...[
                      copy.problem,
                      copy.missing.length
                        ? "Missing: " + copy.missing.join(", ")
                        : "",
                      copy.changed.length
                        ? "Changed: " + copy.changed.join(", ")
                        : "",
                      copy.extra.length
                        ? "Extra: " + copy.extra.join(", ")
                        : "",
                    ].filter(Boolean),
                  ]),
                  "",
                  "Different files do not establish whether a skill is older or locally edited.",
                  "Comparison uses the offline catalog, not latest upstream releases.",
                ]
              : ["No skill selected."];
            hint = "Up/Down scroll   Esc back";
          } else if (mode === "review") {
            const review = prepared?.review ?? buildInventoryReview(model);
            const layout = reviewLayout(review, {
              width,
              tab: reviewTab,
              styled: styling,
              ascii: flags.ascii ?? false,
            });
            pinned = layout.pinned;
            body = layout.body;
            context = flags.dryRun
              ? "Read-only. No files, ownership records or profile configuration will change."
              : confirming
                ? `Save both profiles and apply files on this machine [${active}]? y confirms; Esc cancels.`
                : `Applies local files for [${active}] only. Other machine files require a separate review there.`;
            hint = `Tab/Left/Right sections   Up/Down scroll${flags.dryRun ? "" : "   a save & apply"}`;
          } else {
            body = [
              "Keyboard controls",
              "",
              "Up/Down, j/k  Move between skills",
              "Space  Toggle current-profile membership",
              "p  Edit profiles; Left/Right chooses, Space toggles",
              "d  Details",
              "Enter  Review all draft proposals",
              "In review: Tab/Left/Right or 1-4 switches Overview, Profiles, Files, Blockers",
              "/  Search names, descriptions and profiles",
              "f  All / Changes / Installed / Available",
              "r  Discard every draft edit",
              "q  Quit",
              "",
              "● enabled explicitly   ○ required   blank unselected",
              "Warnings and external ownership appear in Status, never in On.",
              "--ascii uses x enabled, o required, blank unselected",
              "",
              "Sort: selected, new enables/adoptions, removals, remaining; names alphabetical.",
              `Current machine profile: ${active}. Both profile drafts are saved together.`,
              "Other machine profile edits never change its files remotely.",
              "Scans user installations in five global agent skill roots.",
              "System skills, Codex/Claude plugin bundles and aliases into them are excluded.",
              "Catalog entries remain available even when not installed.",
              "Project-local skill directories are not scanned.",
              ...model.excluded.map(
                (item) =>
                  "Excluded provider path: " +
                  item.path +
                  (item.path !== item.physical ? " -> " + item.physical : ""),
              ),
              "",
              ...model.diagnostics.map((item) => "Warning: " + item),
            ];
            hint = "Up/Down scroll   Esc back";
          }
          // Wrap descriptions and paths rather than losing detail in the scrollable views.
          if (mode !== "list" && mode !== "review")
            body = body.flatMap((line) => {
              const safe = (line.startsWith("  ") ? "  " : "") + clean(line),
                lines: string[] = [];
              for (
                let index = 0;
                index < safe.length;
                index += Math.max(1, width)
              )
                lines.push(safe.slice(index, index + width));
              return lines.length ? lines : [""];
            });
          const footer = [
            ...(() => {
              const value = clean(
                search
                  ? `Search: ${query}_  Enter finish / Esc cancel`
                  : message || context,
              );
              return [
                value.slice(0, width),
                ...(value.length > width
                  ? [clip(value.slice(width), width)]
                  : []),
              ];
            })(),
            clip(hint, width),
            clip(
              mode === "review"
                ? "Esc inventory   q quit"
                : "/ search   f filter   r discard draft   ? help   q quit",
              width,
            ),
          ];
          const capacity = Math.max(
            1,
            height - header.length - pinned.length - footer.length - 1,
          );
          top = Math.max(0, Math.min(top, body.length - capacity));
          const frame =
            width < 38 || height < 20
              ? "Enlarge terminal to 39 columns and 20 rows. q quits."
              : [
                  ...header,
                  ...pinned,
                  ...body.slice(top, top + capacity),
                  ...Array(
                    Math.max(
                      0,
                      capacity - body.slice(top, top + capacity).length,
                    ),
                  ).fill(""),
                  "",
                  ...footer,
                ].join("\r\n");
          yield* terminal
            .display("\x1b[?2026h\x1b[H\x1b[2J" + frame + "\x1b[0m\x1b[?2026l")
            .pipe(Effect.orDie);
          const event = yield* Effect.raceFirst(
            Queue.take(input).pipe(Effect.orElseSucceed(() => undefined)),
            Effect.gen(function* () {
              while (true) {
                yield* Effect.sleep("150 millis");
                if (
                  (yield* terminal.columns) - 1 !== width ||
                  (yield* terminal.rows) !== height
                )
                  return null;
              }
            }),
          );
          if (event === null) continue;
          if (!event) break;
          const key = event.key,
            value = Option.getOrElse(event.input, () => "");
          if (key.ctrl && ["c", "d"].includes(key.name)) break;
          if (confirming) {
            confirming = false;
            if (key.name === "y" && prepared && !flags.dryRun) {
              message = "Saving and applying reviewed changes...";
              yield* terminal
                .display("\r\n" + message + "\r\n")
                .pipe(Effect.orDie);
              const applied = yield* applyInventory(
                model,
                flags,
                environment,
                prepared,
              ).pipe(Effect.result);
              if (applied._tag === "Failure") message = applied.failure.message;
              else {
                model = yield* collectInventory(
                  root,
                  { ...flags, profiles: [active] },
                  environment,
                );
                mode = "list";
                prepared = undefined;
                message =
                  "Saved both profiles and applied local file changes. Remote files were not changed.";
              }
            } else
              message = "Confirmation cancelled. No new operation started.";
            continue;
          }
          if (search) {
            if (key.name === "return") search = false;
            else if (key.name === "escape") {
              query = searchBackup;
              search = false;
            } else if (key.ctrl && key.name === "u") query = "";
            else if (key.name === "backspace") query = query.slice(0, -1);
            else if (!key.ctrl && !key.meta && value && clean(value) === value)
              query += value;
            focus = "";
            top = 0;
            continue;
          }
          if (key.name === "q") break;
          if (profileMode) {
            if (["escape", "return", "p"].includes(key.name)) {
              profileMode = false;
              message = "Profile edits staged. Enter reviews all drafts.";
              continue;
            }
            if (["left", "right"].includes(key.name)) {
              profile = profile === "client" ? "home-lab" : "client";
              message = "";
              continue;
            }
            if (key.name === "space") {
              message = toggleMembership(model, focus, profile);
              continue;
            }
          }
          if (key.name === "escape") {
            mode = "list";
            top = 0;
            message = "";
            continue;
          }
          if (
            mode === "review" &&
            ["tab", "left", "right", "1", "2", "3", "4"].includes(key.name)
          ) {
            const nextTabIndex: number = ["1", "2", "3", "4"].includes(key.name)
              ? Number(key.name) - 1
              : (reviewTabs.indexOf(reviewTab) +
                  (key.name === "left" || key.shift ? -1 : 1) +
                  reviewTabs.length) %
                reviewTabs.length;
            reviewTab = reviewTabs[nextTabIndex] ?? "Overview";
            top = 0;
            message = "";
            continue;
          }
          if (mode !== "list") {
            if (["down", "j", "pagedown"].includes(key.name))
              top += key.name === "pagedown" ? 5 : 1;
            if (["up", "k", "pageup"].includes(key.name))
              top = Math.max(0, top - (key.name === "pageup" ? 5 : 1));
            if (mode === "review" && ["return", "y", "a"].includes(key.name)) {
              if (flags.dryRun)
                message =
                  "Dry run only. Apply is disabled; no files or configuration are changed.";
              else if (key.name === "a" && prepared) {
                if (prepared.review.blockers.length)
                  message = "Resolve blockers before saving and applying.";
                else {
                  confirming = true;
                  message = "";
                }
              } else
                message =
                  "Press a to save both profiles and apply local files, then y to confirm.";
            }
            continue;
          }
          const index = table.rows.findIndex((item) => item.name === focus);
          if (
            [
              "down",
              "j",
              "up",
              "k",
              "pagedown",
              "pageup",
              "home",
              "end",
            ].includes(key.name)
          ) {
            const delta = ["up", "k", "pageup"].includes(key.name) ? -1 : 1;
            const next =
              key.name === "home"
                ? 0
                : key.name === "end"
                  ? table.rows.length - 1
                  : index +
                    delta * (["pagedown", "pageup"].includes(key.name) ? 5 : 1);
            focus =
              table.rows[Math.max(0, Math.min(table.rows.length - 1, next))]
                ?.name ?? "";
            message = "";
          } else if (key.name === "space")
            message = toggleMembership(model, focus, active);
          else if (key.name === "p") {
            profileMode = true;
            profile = active;
            message = "";
          } else if (key.name === "d") {
            mode = "detail";
            top = 0;
            message = "";
          } else if (key.name === "return") {
            const preparation = yield* prepareInventory(
              model,
              flags,
              environment,
            ).pipe(Effect.result);
            if (preparation._tag === "Failure") {
              message = preparation.failure.message;
              continue;
            }
            prepared = preparation.success;
            mode = "review";
            reviewTab = "Overview";
            top = 0;
            message = "";
          } else if (value === "?") {
            mode = "help";
            top = 0;
          } else if (value === "/") {
            search = true;
            searchBackup = query;
          } else if (key.name === "f") {
            filter =
              filters[(filters.indexOf(filter) + 1) % filters.length] ?? "all";
            top = 0;
          } else if (key.name === "r") {
            model.draft = {
              client: [...model.original.client],
              "home-lab": [...model.original["home-lab"]],
            };
            message = "Discarded profile drafts. Installed state is unchanged.";
          }
        }
      }),
    );
  const result: Result = {
    schemaVersion: 1,
    command: "inventory",
    ok: true,
    exitCode: 0,
    checkout: root,
    home: model.home,
    selection: { profiles: [], skills: [], targets: [] },
    entries: [],
    diagnostics: [],
  };
  return result;
});
