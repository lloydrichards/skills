import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { GitInfo } from "./model.js";

const execute = promisify(execFile);
interface GitEntry {
  readonly mode: string;
  readonly hash: string;
}

// Git status can invoke fsmonitor and clean/process filters. These plumbing
// commands only inspect objects and index names; worktree bytes are read below.
export const inspectGit = async (
  root: string,
  scope?: string,
): Promise<GitInfo | undefined> => {
  const git = async (...args: string[]) => {
    const { stdout } = await execute(
      "git",
      [
        "--no-optional-locks",
        "--no-replace-objects",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "-C",
        root,
        ...args,
      ],
      {
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_NO_LAZY_FETCH: "1",
          GIT_ALLOW_PROTOCOL: "",
        },
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    return stdout;
  };
  try {
    const revision = (await git("rev-parse", "--verify", "HEAD")).trim();
    const top = (await git("rev-parse", "--show-toplevel")).replace(/\n$/, "");
    const algorithm = (await git("rev-parse", "--show-object-format")).trim();
    if (algorithm !== "sha1" && algorithm !== "sha256") return undefined;
    const prefix = relative(top, resolve(root, scope ?? "."))
      .split("\\")
      .join("/");
    if (prefix === ".." || prefix.startsWith("../")) return undefined;
    const selected = (name: string) =>
      !prefix || name === prefix || name.startsWith(prefix + "/");
    const head = new Map<string, GitEntry>();
    for (const record of (
      await git("ls-tree", "--full-tree", "-r", "-z", "HEAD")
    ).split("\0")) {
      if (!record) continue;
      const tab = record.indexOf("\t");
      const [mode, , hash] = record.slice(0, tab).split(" ");
      if (tab < 0 || !mode || !hash) return undefined;
      head.set(record.slice(tab + 1), { mode, hash });
    }
    const index = new Map<string, GitEntry>();
    const changes = new Set<string>();
    // --full-name keeps paths relative to the worktree even for nested checkouts.
    for (const record of (
      await git("ls-files", "--full-name", "--stage", "-z")
    ).split("\0")) {
      if (!record) continue;
      const tab = record.indexOf("\t");
      const [mode, hash, stage] = record.slice(0, tab).split(" ");
      const name = record.slice(tab + 1);
      if (tab < 0 || !mode || !hash || !stage) return undefined;
      if (stage !== "0" && selected(name)) changes.add("UU " + name);
      index.set(name, { mode, hash });
    }
    for (const name of new Set([...head.keys(), ...index.keys()])) {
      if (!selected(name)) continue;
      const old = head.get(name),
        current = index.get(name);
      if (!old) changes.add("A  " + name);
      else if (!current) changes.add("D  " + name);
      else if (old.hash !== current.hash || old.mode !== current.mode)
        changes.add("M  " + name);
    }
    for (const [name, entry] of index) {
      if (!selected(name)) continue;
      const parts = name.split("/");
      if (
        parts.some(
          (part) => !part || part === "." || part === ".." || part === ".git",
        )
      )
        return undefined;
      let parent = top,
        unsafeParent = false;
      for (const part of parts.slice(0, -1)) {
        parent = join(parent, part);
        const stat = await fs.lstat(parent).catch((error: unknown) => {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ENOENT"
          )
            return undefined;
          throw error;
        });
        if (!stat?.isDirectory()) {
          unsafeParent = true;
          break;
        }
      }
      if (unsafeParent) {
        changes.add(" M " + name);
        continue;
      }
      const file = join(top, name);
      let stat;
      try {
        stat = await fs.lstat(file);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          changes.add(" D " + name);
          continue;
        }
        throw error;
      }
      // Gitlinks and transformed worktrees are conservatively dirty. Content
      // digests, rather than this informational metadata, decide installations.
      if (
        entry.mode === "160000" ||
        (!stat.isFile() && !stat.isSymbolicLink())
      ) {
        changes.add(" M " + name);
        continue;
      }
      const data = stat.isSymbolicLink()
        ? Buffer.from(await fs.readlink(file))
        : await fs.readFile(file);
      const mode = stat.isSymbolicLink()
        ? "120000"
        : stat.mode & 0o111
          ? "100755"
          : "100644";
      const hash = createHash(algorithm)
        .update(`blob ${data.length}\0`)
        .update(data)
        .digest("hex");
      if (hash !== entry.hash || mode !== entry.mode) changes.add(" M " + name);
    }
    for (const name of (
      await git(
        "ls-files",
        "--full-name",
        "--others",
        "--exclude-standard",
        "-z",
      )
    ).split("\0")) {
      if (name && selected(name)) changes.add("?? " + name);
    }
    const sorted = [...changes].sort();
    return { revision, dirty: sorted.length > 0, changes: sorted };
  } catch {
    // Git metadata is optional, including when a partial clone lacks objects.
    // Never fetch objects or run repository helpers to fill that gap.
    return undefined;
  }
};
