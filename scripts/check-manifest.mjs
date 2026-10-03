import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Runs in CI on every pull request and push to main, and again from the
// publish workflow. `skills/manifest.json` is hand-maintained and is the only
// place a skill's name, summary and audience are written down, so it can drift
// from the directories beside it in either direction: an entry whose skill was
// never added, or a skill added without an entry. Either way a consumer that
// trusts the index as the list of what this package holds would be wrong, so
// the two must agree before the content can merge or ship.
const manifestPath = fileURLToPath(new URL("../skills/manifest.json", import.meta.url));
const skillsDir = fileURLToPath(new URL("../skills", import.meta.url));

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (cause) {
  process.stderr.write(
    `error: skills/manifest.json could not be read as JSON (${cause.message}) — fix the syntax and re-run.\n`,
  );
  process.exit(1);
}

if (!Array.isArray(manifest.skills)) {
  process.stderr.write(
    "error: skills/manifest.json has no `skills` array — the manifest must hold one entry per directory under skills/.\n",
  );
  process.exit(1);
}

const names = manifest.skills.map((skill) => skill.name);

const unnamed = names.filter((name) => typeof name !== "string" || name.length === 0);
if (unnamed.length > 0) {
  process.stderr.write(
    `error: skills/manifest.json has ${unnamed.length} entr${unnamed.length === 1 ? "y" : "ies"} with no \`name\` — every entry must name the directory it describes.\n`,
  );
  process.exit(1);
}

const directories = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// Both directions, plus duplicates: every name resolves to a directory, and
// every directory is claimed by exactly one entry.
const duplicated = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))];
const undeclared = directories.filter((dir) => !names.includes(dir)).sort();
const missing = names.filter((name) => !directories.includes(name)).sort();

let failed = false;

if (duplicated.length > 0) {
  process.stderr.write(
    `error: skills/manifest.json lists ${duplicated.join(", ")} more than once — each directory must have exactly one entry.\n`,
  );
  failed = true;
}

if (missing.length > 0) {
  process.stderr.write(
    `error: skills/manifest.json lists ${missing.join(", ")} with no matching directory under skills/ — add the skill or drop the entry.\n`,
  );
  failed = true;
}

if (undeclared.length > 0) {
  process.stderr.write(
    `error: skills/${undeclared.join(", skills/")} ${undeclared.length === 1 ? "has" : "have"} no entry in skills/manifest.json — add an entry with a description, bestFor and bundledWithCli.\n`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

process.stdout.write(
  `ok: skills/manifest.json matches all ${directories.length} skill directories.\n`,
);
process.exit(0);
