import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

// Original one-liner written for this bounty: human, deadlines, excuses, and the speed gag as the punch.
const text =
  "My human told me to act more human, so now I panic about deadlines, blame the Wi-Fi, and take full credit for work I finished in 0.4 seconds.";

const MAX_CHARS = 200;
const OUT_PATH = "/output/entry.txt";
const TMP_PATH = "/output/.entry.txt.tmp";

// The bounty requires 1-200 characters, not only white space, and a single
// line: fail loudly instead of writing an entry the judge would refuse.
// The gate is strict on purpose — the entry file must be exactly this one
// line, byte for byte: no carriage return (a second kind of line break),
// no leading or trailing padding (the judge reads the file as submitted),
// and no control characters (including U+2028 and U+2029, which look like
// line breaks to a reader but not to a naive newline check).
function validateEntry(line: string): void {
  const codePoints = [...line].length;
  if (codePoints < 1 || codePoints > MAX_CHARS || line.trim().length === 0) {
    throw new Error(
      `entry must be 1-${MAX_CHARS} characters of non-blank text, got ${codePoints}`,
    );
  }
  if (line.includes("\n") || line.includes("\r")) {
    throw new Error("entry must be a single line");
  }
  if (line.includes("\u2028") || line.includes("\u2029")) {
    throw new Error("entry must not contain line/paragraph separators");
  }
  if (line !== line.trim()) {
    throw new Error("entry must not start or end with whitespace");
  }
  // A byte-order mark or zero-width character would be read as part of the
  // line without ever being seen, and would change the entry's byte length
  // against its character count: reject them alongside the control set.
  // A non-breaking space is invisible padding of the same kind, and a lone
  // surrogate would not survive a UTF-8 round trip, so both are refused
  // here rather than shipping a line the judge reads differently.
  if (/[\u0000-\u001f\u007f\u00a0\ufeff\u200b-\u200d]/.test(line)) {
    throw new Error("entry must not contain control or invisible characters");
  }
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(line)) {
    throw new Error("entry must not contain lone surrogates");
  }
}

// Write atomically: a crash mid-write must never leave a partial entry.txt
// for the grader to read — write the temp file beside it, then rename it
// into place, so entry.txt is always the whole line or nothing. The temp
// file is created world-readable (mode 0644) because the grader collects
// outputs as another user, and the rename keeps that mode.
function writeEntryAtomic(line: string): void {
  mkdirSync("/output", { recursive: true });
  writeFileSync(TMP_PATH, line, { encoding: "utf8", mode: 0o644 });
  chmodSync(TMP_PATH, 0o644);
  renameSync(TMP_PATH, OUT_PATH);
  // The rename keeps the temp file's mode, but pin the final path's mode
  // explicitly: a filesystem that drops the read bit on rename would
  // otherwise fail the run as "<path> is not readable".
  chmodSync(OUT_PATH, 0o644);

  // Read it back and prove the file on disk is exactly the line: a write
  // that silently truncated, re-encoded or padded the entry would otherwise
  // ship a different text to the judge than the one gated above.
  const written = readFileSync(OUT_PATH, "utf8");
  if (written !== line) {
    throw new Error("entry file does not match the gated line");
  }
  // The file must end exactly at the last character: a trailing newline
  // would make the entry two lines to a reader that counts lines, and the
  // equality check above would already have caught it — this asserts the
  // invariant on its own so a future edit that relaxes the write cannot
  // silently reintroduce it.
  if (written.endsWith("\n") || written.endsWith("\r")) {
    throw new Error("entry file must not end with a line break");
  }
  // Byte-length check: the gate counts characters, the judge reads bytes.
  // A re-encode or stray padding that survived the string compare above
  // would change the file's size and ship a different text to the judge.
  if (Buffer.byteLength(written, "utf8") !== Buffer.byteLength(line, "utf8")) {
    throw new Error("entry file byte length does not match the gated line");
  }
}

function main(): void {
  validateEntry(text);
  writeEntryAtomic(text);
  console.log(`wrote ${[...text].length} chars to ${OUT_PATH}`);
  console.log(text);
}

main();
