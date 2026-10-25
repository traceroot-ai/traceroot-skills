import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

// `name` alone is not enough to be a usable index entry. The CLI reads
// `description` and `bestFor` as the prose for `skills list`, and selects what
// it vendors on `bundledWithCli` — so an entry missing one of those publishes
// an index that reads `undefined`, or quietly drops a skill from the bundle
// because a missing flag is falsy. Check the shape of each, not just its
// presence.
const malformed = [];
for (const skill of manifest.skills) {
  const problems = [];
  if (typeof skill.description !== "string" || skill.description.trim().length === 0) {
    problems.push("`description` must be a non-empty string");
  }
  if (
    !Array.isArray(skill.bestFor) ||
    skill.bestFor.length === 0 ||
    !skill.bestFor.every((tag) => typeof tag === "string" && tag.trim().length > 0)
  ) {
    problems.push("`bestFor` must be a non-empty array of non-empty strings");
  }
  if (typeof skill.bundledWithCli !== "boolean") {
    problems.push("`bundledWithCli` must be true or false");
  }
  if (problems.length > 0) {
    malformed.push(`${skill.name}: ${problems.join("; ")}`);
  }
}

if (malformed.length > 0) {
  process.stderr.write(
    `error: skills/manifest.json has malformed entr${malformed.length === 1 ? "y" : "ies"} — ${malformed.join(" / ")}.\n`,
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

// A manifest entry names a directory, but consumers key on the frontmatter
// `name:` inside that directory's SKILL.md: `npx skills add --skill <name>`
// matches against it, and a SKILL.md that declares no `name` is skipped
// outright. So a directory whose SKILL.md is missing, or names something else,
// still yields an index entry nothing can resolve — the folder agreeing with
// the manifest is not enough on its own.
// The value is a YAML scalar: an unquoted one ends at a comment and a quoted
// one at its closing quote, so `name: traceroot-eval # the consumer id` and
// `name: "traceroot-eval"` both declare `traceroot-eval`. Comparing the rest
// of the line verbatim instead fails this check on valid frontmatter.
const scalar = (raw) => {
  const value = raw.trim();
  const quote = value.charAt(0);
  if (quote === '"' || quote === "'") {
    const close = value.indexOf(quote, 1);
    // An unterminated quote is a YAML syntax error, and so is anything but a
    // comment after the closing one. A parser fails on the whole document in
    // both cases, so a consumer resolves no name at all — which is what this
    // has to report rather than guessing at the contents.
    if (close === -1 || !/^[ \t]*(?:#|$)/.test(value.slice(close + 1))) {
      return "";
    }
    return value.slice(1, close);
  }
  // `#` opens a comment only at the start of the value or after whitespace, so
  // a name is still free to contain one.
  const comment = /(?:^|[ \t])#/.exec(value);
  return (comment === null ? value : value.slice(0, comment.index)).trim();
};

const frontmatterName = (text) => {
  const lines = text.split("\n");
  // Frontmatter is delimited by `---` alone on a line. Accepting any line that
  // merely begins with `---` reads a `name:` out of a document that declares
  // no frontmatter at all, such as one opening on `---not-frontmatter`.
  if (lines[0].trimEnd() !== "---") {
    return null;
  }
  const close = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (close === -1) {
    return null;
  }
  for (const line of lines.slice(1, close)) {
    // Matched against the trimmed line because `.` does not match a carriage
    // return, so a CRLF checkout would otherwise read as declaring no name.
    const match = /^name:[ \t]*(.*)$/.exec(line.trimEnd());
    if (match !== null) {
      // `name:` with nothing after it declares no name rather than an empty
      // one, which reads as the missing declaration it is.
      return scalar(match[1]) || null;
    }
  }
  return null;
};

const misdeclared = [];
for (const name of names) {
  if (!directories.includes(name)) {
    // Already reported above as an entry with no directory.
    continue;
  }
  let text;
  try {
    text = readFileSync(join(skillsDir, name, "SKILL.md"), "utf8");
  } catch {
    misdeclared.push(`skills/${name}/SKILL.md is missing`);
    continue;
  }
  const declared = frontmatterName(text);
  if (declared === null) {
    misdeclared.push(`skills/${name}/SKILL.md declares no usable frontmatter \`name\``);
  } else if (declared !== name) {
    misdeclared.push(`skills/${name}/SKILL.md declares \`name: ${declared}\``);
  }
}

if (misdeclared.length > 0) {
  process.stderr.write(
    `error: ${misdeclared.join(" / ")} — consumers match the frontmatter \`name\`, so it must equal both the directory and the manifest entry.\n`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

process.stdout.write(
  `ok: skills/manifest.json matches all ${directories.length} skill directories, each with a SKILL.md naming itself.\n`,
);
process.exit(0);
