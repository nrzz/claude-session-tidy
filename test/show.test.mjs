import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DAY, NOW, run, runCli, session, snapshot, world } from "./helpers.mjs";

const ID_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const ID_C = "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa";

test("show prints full session details, size breakdown, sweep, and companion files", async () => {
  const w = world("show-basic");
  const projectDir = path.join(w.home, "code", "shop");
  const s = session(w, {
    id: ID_A,
    cwd: projectDir,
    prompt: "Investigate checkout latency",
    prompts: 3,
    ageDays: 2,
    companions: true,
  });
  // Remove custom-title.json so the title comes from the first prompt
  fs.rmSync(path.join(w.claude, "projects", s.slug, ID_A, "custom-title.json"));

  const res = await run(["show", ID_A.slice(0, 8)], w);
  assert.equal(res.code, 0, res.all);

  const lines = res.out.split("\n");
  assert.match(lines[0], new RegExp(`^${ID_A}\\s+Investigate checkout latency`));
  assert.equal(lines[1], "Project    ~/code/shop");
  assert.match(lines[2], /^Started\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+Last activity\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+Prompts\s+3$/);
  assert.match(lines[3], /^Size\s+.*:\s+transcript\s+.*,\s+tool results\s+.*\(2 files\),\s+subagents\s+.*\(2\),\s+file history\s+.*\(2\)/);
  assert.equal(lines[4], "Kept       no");
  assert.match(lines[5], /^Cleanup\s+scheduled for \d{4}-\d{2}-\d{2} \(30 days without a change; cleanupPeriodDays is not set\)$/);
  assert.equal(lines[6], "Files");

  // Verify companion files listed
  assert.ok(res.out.includes(`~/.claude/projects/`));
  assert.ok(res.out.includes(`${ID_A}.jsonl`));
  assert.ok(res.out.includes(`/${ID_A}/   (4 files)`));
  assert.ok(res.out.includes(`file-history/${ID_A}/   (2 files)`));
  assert.ok(res.out.includes(`uploads/${ID_A}/   (1 file)`));
  assert.ok(res.out.includes(`debug/${ID_A}.txt`));
});

test("show --json returns complete JSON document with required schema", async () => {
  const w = world("show-json");
  const s = session(w, {
    id: ID_A,
    project: "shop",
    prompt: "Add discount code input",
    prompts: 4,
    ageDays: 5,
    companions: true,
  });
  fs.rmSync(path.join(w.claude, "projects", s.slug, ID_A, "custom-title.json"));

  const res = await run(["show", ID_A, "--json"], w);
  assert.equal(res.code, 0, res.err);

  const doc = JSON.parse(res.out);
  assert.equal(doc.ok, true);
  assert.equal(doc.id, ID_A);
  assert.equal(doc.title, "Add discount code input");
  assert.equal(doc.prompts, 4);
  assert.ok(typeof doc.firstActivity === "string" && doc.firstActivity.length > 0);
  assert.ok(typeof doc.lastActivity === "string" && doc.lastActivity.length > 0);
  assert.equal(typeof doc.size.total, "number");
  assert.equal(typeof doc.size.transcript, "number");
  assert.equal(typeof doc.size.toolResults, "number");
  assert.equal(typeof doc.size.subagents, "number");
  assert.equal(typeof doc.size.fileHistory, "number");
  assert.deepEqual(doc.kept, { kept: false });
  assert.equal(doc.sweep.state, "scheduled");
  assert.equal(doc.sweep.days, 30);
  assert.equal(doc.sweep.source, "default");
  assert.ok(Array.isArray(doc.files));
  assert.ok(doc.files.length >= 4);

  const transcriptEntry = doc.files.find((f) => f.path.endsWith(`${ID_A}.jsonl`));
  assert.ok(transcriptEntry);
  assert.equal(transcriptEntry.kind, "file");
  assert.equal(typeof transcriptEntry.bytes, "number");
  assert.equal(transcriptEntry.count, undefined);

  const companionDir = doc.files.find((f) => f.path.endsWith(`/${ID_A}`));
  assert.ok(companionDir);
  assert.equal(companionDir.kind, "dir");
  assert.equal(companionDir.count, 4);
});

test("show displays kept status with since and refreshDue", async () => {
  const w = world("show-kept");
  session(w, {
    id: ID_A,
    project: "shop",
    prompt: "Important refactor",
    ageDays: 3,
  });

  // Keep the session
  const keepRes = await run(["keep", ID_A.slice(0, 8)], w);
  assert.equal(keepRes.code, 0);

  const res = await run(["show", ID_A.slice(0, 8)], w);
  assert.equal(res.code, 0);
  assert.match(res.out, /Kept\s+yes, since \d{4}-\d{2}-\d{2} \(refresh due \d{4}-\d{2}-\d{2}\)/);

  // In JSON mode
  const jsonRes = await run(["show", ID_A.slice(0, 8), "--json"], w);
  assert.equal(jsonRes.code, 0);
  const j = JSON.parse(jsonRes.out);
  assert.equal(j.kept.kept, true);
  assert.match(j.kept.since, /^\d{4}-\d{2}-\d{2}/);
  assert.match(j.kept.refreshDue, /^\d{4}-\d{2}-\d{2}/);
});

test("show formats sweep state correctly for due, exempt, and paused", async () => {
  const w = world("show-sweep-states");

  // Overdue session (due)
  session(w, {
    id: ID_A,
    project: "shop",
    prompt: "Old session",
    ageDays: 35,
  });

  const dueRes = await run(["show", ID_A], w);
  assert.equal(dueRes.code, 0);
  assert.match(dueRes.out, /Cleanup\s+due \(30 days without a change; cleanupPeriodDays is not set\)/);

  // Desktop session (exempt)
  session(w, {
    id: ID_B,
    project: "shop",
    prompt: "Desktop session",
    ageDays: 40,
    entrypoint: "claude-desktop",
  });

  const exemptRes = await run(["show", ID_B], w);
  assert.equal(exemptRes.code, 0);
  assert.match(exemptRes.out, /Cleanup\s+exempt \(started by Claude Desktop\)/);

  const exemptJson = JSON.parse((await run(["show", ID_B, "--json"], w)).out);
  assert.equal(exemptJson.sweep.state, "exempt");
  assert.equal(exemptJson.sweep.day, null);

  // Paused session via settings
  w.settings({ cleanupPeriodDays: 0 });
  const pausedRes = await run(["show", ID_A], w);
  assert.equal(pausedRes.code, 0);
  assert.match(pausedRes.out, /Cleanup\s+paused/);
});

test("show displays multiple project paths if session has copies across projects", async () => {
  const w = world("show-multi-project");
  session(w, { id: ID_A, project: "shop-frontend", prompt: "Shared session" });
  session(w, { id: ID_A, project: "shop-backend", prompt: "Shared session" });

  const res = await run(["show", ID_A], w);
  assert.equal(res.code, 0);
  assert.match(res.out, /^Project\s+/m);
  // Both paths should appear
  assert.ok(res.out.includes("shop-frontend"));
  assert.ok(res.out.includes("shop-backend"));
});

test("show refuses missing, unknown, ambiguous, and multiple ids", async () => {
  const w = world("show-errors");
  session(w, { id: ID_A, project: "shop" });
  session(w, { id: ID_C, project: "shop" }); // starts with same aaaaaaaa prefix

  // 1. Missing ID
  const noId = await run(["show"], w);
  assert.equal(noId.code, 1);
  assert.match(noId.err, /Which session\? Give its id/);

  // 2. Unknown ID
  const unknownId = await run(["show", ID_B], w);
  assert.equal(unknownId.code, 1);
  assert.match(unknownId.err, new RegExp(`No session has the id "${ID_B}"`));

  // 3. Ambiguous ID
  const ambig = await run(["show", "aaaaaaaa"], w);
  assert.equal(ambig.code, 1);
  assert.match(ambig.err, /"aaaaaaaa" is ambiguous/);

  // 4. Multiple IDs
  const multi = await run(["show", ID_A, ID_C], w);
  assert.equal(multi.code, 1);
  assert.match(multi.err, /show takes one session at a time\./);

  // 5. With --json flag, errors are returned as JSON
  const jsonErr = await run(["show", "missing", "--json"], w);
  assert.equal(jsonErr.code, 1);
  const j = JSON.parse(jsonErr.out);
  assert.equal(j.ok, false);
  assert.match(j.error, /No session has the id "missing"/);
});

test("show is strictly read-only and leaves the config folder untouched", async () => {
  const w = world("show-read-only");
  session(w, { id: ID_A, project: "shop", companions: true });
  const beforeSnap = snapshot(w.claude);

  const resText = await run(["show", ID_A.slice(0, 8)], w);
  assert.equal(resText.code, 0);
  assert.deepEqual(snapshot(w.claude), beforeSnap);

  const resJson = await run(["show", ID_A.slice(0, 8), "--json"], w);
  assert.equal(resJson.code, 0);
  assert.deepEqual(snapshot(w.claude), beforeSnap);
});

test("show works when invoked as standalone CLI child process", async () => {
  const w = world("show-cli-proc");
  session(w, { id: ID_A, project: "shop", prompt: "CLI child process test" });

  const r = runCli(["show", ID_A.slice(0, 8)], { env: w.env });
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes("CLI child process test"));
  assert.ok(r.out.includes(ID_A));
});
