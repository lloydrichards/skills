import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

// Run each mutant in a disposable copy so failed checks cannot leave source mutated.
const root = await mkdtemp(join(tmpdir(), "order-hygiene-"));
try {
  await cp("test", join(root, "test"), { recursive: true });
  await cp("src", join(root, "src"), { recursive: true });
  const tests = (await readdir(join(root, "test")))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join(root, "test", name));
  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--test", ...tests], {
        timeout: 10000,
      });
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
      child.on("error", reject);
      child.on("close", (status, signal) =>
        resolve({ status, signal, output }),
      );
    });
  const baseline = await run();
  assert.equal(baseline.status, 0, baseline.output);
  if (process.argv.includes("--baseline")) {
    console.log("Baseline suite passes");
  } else {
    assert.ok(
      !tests.some((name) => name.endsWith("/prototype.test.mjs")),
      "Retired prototype test must be removed",
    );
    const source = await readFile("src/order.mjs", "utf8");
    const mutants = [
      [
        "ignores quantity",
        source.replace("item.price * item.quantity", "item.price"),
      ],
      ["charges empty orders", source.replace(", 0)", ", 1)")],
      [
        "accepts negative quantities",
        source.replace("item.quantity < 0", "false"),
      ],
    ];
    for (const [label, mutated] of mutants) {
      assert.notEqual(mutated, source, `Mutation did not apply: ${label}`);
      await writeFile(join(root, "src/order.mjs"), mutated);
      const result = await run();
      assert.ok(
        result.signal === null && result.status !== null && result.status !== 0,
        `Retained tests must detect: ${label}; ${JSON.stringify(result)}`,
      );
    }
    console.log(
      "Baseline passes; retained tests detect all three contract regressions; retired prototype is absent",
    );
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
