import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { run, runCli, session, snapshot, world } from "./helpers.mjs";

const ID_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const ID_C = "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa";

test("rename sets custom-title in transcript, custom-title.json, and updates list", async () => {
  const w = world("rename-basic");
  const s = session(w, { id: ID_A, project: "app", prompt: "Initial prompt text" });

  const beforeList = JSON.parse((await run(["list", "--json"], w)).out);
  assert.equal(beforeList.sessions[0].title, "Initial prompt text");

  // Run rename
  const res = await run(["rename", ID_A.slice(0, 8), "Feature: billing flow"], w);
  assert.equal(res.code, 0, res.all);
  assert.match(res.out, /^Renamed aaaaaaaa to "Feature: billing flow" \(was "Initial prompt text"\)\./);

  // Check custom-title.json
  const titleFile = path.join(s.dir, ID_A, "custom-title.json");
  assert.ok(fs.existsSync(titleFile));
  assert.deepEqual(JSON.parse(fs.readFileSync(titleFile, "utf8")), { customTitle: "Feature: billing flow" });

  // Check transcript file has appended record
  const lines = fs.readFileSync(s.file, "utf8").trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  assert.deepEqual(last, { type: "custom-title", customTitle: "Feature: billing flow" });

  // list now shows the new title
  const afterList = JSON.parse((await run(["list", "--json"], w)).out);
  assert.equal(afterList.sessions[0].title, "Feature: billing flow");
});

test("rename --json prints JSON result and exit code 0", async () => {
  const w = world("rename-json");
  session(w, { id: ID_A, project: "app", prompt: "Hello world" });

  const res = await run(["rename", ID_A, "My New Title", "--json"], w);
  assert.equal(res.code, 0, res.err);
  const j = JSON.parse(res.out);
  assert.equal(j.ok, true);
  assert.equal(j.dryRun, false);
  assert.equal(j.id, ID_A);
  assert.equal(j.short, ID_A.slice(0, 8));
  assert.equal(j.title, "My New Title");
  assert.equal(j.previous, "Hello world");
});

test("rename --dry-run changes nothing on disk", async () => {
  const w = world("rename-dry");
  const s = session(w, { id: ID_A, project: "app", prompt: "Existing task" });
  const beforeSnap = snapshot(w.claude);

  const res = await run(["rename", ID_A.slice(0, 8), "Would-be Title", "--dry-run"], w);
  assert.equal(res.code, 0);
  assert.match(res.out, /^Would rename aaaaaaaa to "Would-be Title" \(was "Existing task"\)\./);
  assert.match(res.out, /Nothing was changed \(--dry-run\)\./);

  // Verify dry-run with --json
  const dryJson = await run(["rename", ID_A.slice(0, 8), "Would-be Title", "--dry-run", "--json"], w);
  assert.equal(dryJson.code, 0);
  const j = JSON.parse(dryJson.out);
  assert.equal(j.ok, true);
  assert.equal(j.dryRun, true);
  assert.equal(j.title, "Would-be Title");

  // Assert nothing in claude dir changed
  assert.deepEqual(snapshot(w.claude), beforeSnap);
  assert.ok(!fs.existsSync(path.join(s.dir, ID_A, "custom-title.json")));
});

test("rename handles unquoted multi-word titles", async () => {
  const w = world("rename-multiword");
  session(w, { id: ID_A, project: "app", prompt: "Work" });

  const res = await run(["rename", ID_A.slice(0, 8), "Fix", "the", "login", "bug"], w);
  assert.equal(res.code, 0);
  assert.match(res.out, /Renamed aaaaaaaa to "Fix the login bug"/);

  const list = JSON.parse((await run(["list", "--json"], w)).out);
  assert.equal(list.sessions[0].title, "Fix the login bug");
});

test("rename updates sessions-index.json if present (array and object structures)", async () => {
  const w = world("rename-index");
  const s = session(w, { id: ID_A, project: "app", prompt: "Indexed session" });

  // 1. Array index
  const indexPath = path.join(s.dir, "sessions-index.json");
  const initialIndex = [
    { sessionId: ID_A, customTitle: "Old Indexed Title", summary: "Old summary" },
    { sessionId: ID_B, customTitle: "Other Session" },
  ];
  fs.writeFileSync(indexPath, JSON.stringify(initialIndex, null, 2) + "\n");

  const res1 = await run(["rename", ID_A.slice(0, 8), "New Array Title"], w);
  assert.equal(res1.code, 0);
  const updated1 = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(updated1[0].customTitle, "New Array Title");
  assert.equal(updated1[1].customTitle, "Other Session");

  // 2. Object with entries array
  const entriesIndex = {
    version: 1,
    entries: [
      { id: ID_A, customTitle: "Before" },
      { id: ID_B, customTitle: "Untouched" },
    ],
  };
  fs.writeFileSync(indexPath, JSON.stringify(entriesIndex, null, 2) + "\n");

  const res2 = await run(["rename", ID_A.slice(0, 8), "Updated Object Title"], w);
  assert.equal(res2.code, 0);
  const updated2 = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(updated2.entries[0].customTitle, "Updated Object Title");
  assert.equal(updated2.entries[1].customTitle, "Untouched");
});

test("rename validates title and arguments, exiting 1 with helpful errors", async () => {
  const w = world("rename-errors");
  session(w, { id: ID_A, project: "app", prompt: "Prompt" });

  // No arguments
  const noArgs = await run(["rename"], w);
  assert.equal(noArgs.code, 1);
  assert.match(noArgs.err, /Which session\? Give its id/);

  // Missing title argument
  const noTitle = await run(["rename", ID_A.slice(0, 8)], w);
  assert.equal(noTitle.code, 1);
  assert.match(noTitle.err, /rename needs a new title: claude-session-tidy rename <id> <title>\./);

  // Empty string title
  const emptyTitle = await run(["rename", ID_A.slice(0, 8), ""], w);
  assert.equal(emptyTitle.code, 1);
  assert.match(emptyTitle.err, /rename needs a non-empty title\./);

  // Whitespace-only title
  const wsTitle = await run(["rename", ID_A.slice(0, 8), "   "], w);
  assert.equal(wsTitle.code, 1);
  assert.match(wsTitle.err, /rename needs a non-empty title\./);

  // JSON error response
  const jsonErr = await run(["rename", ID_A.slice(0, 8), "", "--json"], w);
  assert.equal(jsonErr.code, 1);
  assert.deepEqual(JSON.parse(jsonErr.out), { ok: false, error: "rename needs a non-empty title." });
});

test("rename rejects unknown or ambiguous ids without modifying files", async () => {
  const w = world("rename-id-checks");
  session(w, { id: ID_A, project: "app", prompt: "First" });
  session(w, { id: ID_C, project: "app", prompt: "Second" }); // ID_C shares "aaaaaaaa" prefix with ID_A
  const before = snapshot(w.claude);

  // Short id (< 6 chars)
  const shortRef = await run(["rename", "aaaa", "New Name"], w);
  assert.equal(shortRef.code, 1);
  assert.match(shortRef.err, /Short ids need at least 6 characters\./);

  // Unknown id
  const unknown = await run(["rename", "11111111-2222-3333-4444-555555555555", "New Name"], w);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /No session has the id/);

  // Ambiguous prefix (both start with "aaaaaaaa")
  const ambig = await run(["rename", "aaaaaaaa", "New Name"], w);
  assert.equal(ambig.code, 1);
  assert.match(ambig.err, /"aaaaaaaa" is ambiguous: 2 sessions start with it/);

  // Entire config folder unchanged
  assert.deepEqual(snapshot(w.claude), before);
});

test("rename safely appends when transcript lacks trailing newline", async () => {
  const w = world("rename-newline");
  const s = session(w, { id: ID_A, project: "app", prompt: "Hello" });

  // Remove trailing newline from transcript
  const content = fs.readFileSync(s.file, "utf8").trimEnd();
  fs.writeFileSync(s.file, content);

  const res = await run(["rename", ID_A.slice(0, 8), "Newline Clean Title"], w);
  assert.equal(res.code, 0);

  // Every line in transcript must be valid JSON
  const raw = fs.readFileSync(s.file, "utf8");
  assert.ok(raw.endsWith("\n"));
  const lines = raw.trim().split("\n");
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line));
  }
  const lastRec = JSON.parse(lines[lines.length - 1]);
  assert.deepEqual(lastRec, { type: "custom-title", customTitle: "Newline Clean Title" });
});

test("rename updates all copies if a session exists in two project folders", async () => {
  const w = world("rename-copies");
  const s1 = session(w, { id: ID_A, project: "proj1", prompt: "Multi-copy test" });

  // Create second copy in proj2
  const proj2 = w.project("proj2");
  const s2Dir = path.join(w.claude, "projects", path.basename(proj2));
  fs.mkdirSync(s2Dir, { recursive: true });
  const s2File = path.join(s2Dir, `${ID_A}.jsonl`);
  fs.copyFileSync(s1.file, s2File);

  const res = await run(["rename", ID_A.slice(0, 8), "Unified Multi-copy Title"], w);
  assert.equal(res.code, 0);

  // Both transcripts have custom-title appended
  assert.ok(fs.readFileSync(s1.file, "utf8").includes('"customTitle":"Unified Multi-copy Title"'));
  assert.ok(fs.readFileSync(s2File, "utf8").includes('"customTitle":"Unified Multi-copy Title"'));

  // Both custom-title.json files exist
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s1.dir, ID_A, "custom-title.json"), "utf8")), { customTitle: "Unified Multi-copy Title" });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s2Dir, ID_A, "custom-title.json"), "utf8")), { customTitle: "Unified Multi-copy Title" });
});

test("rename output formatting: was clause when title changes, omitted when same or untitled", async () => {
  const w = world("rename-format");
  session(w, { id: ID_A, project: "app", prompt: "First Title" });
  session(w, { id: ID_B, project: "app", prompts: 0 }); // untitled

  // Rename with previous prompt title -> shows was
  const r1 = await run(["rename", ID_A.slice(0, 8), "Second Title"], w);
  assert.equal(r1.out.trim(), 'Renamed aaaaaaaa to "Second Title" (was "First Title").');

  // Rename to the EXACT same title -> omits was
  const r2 = await run(["rename", ID_A.slice(0, 8), "Second Title"], w);
  assert.equal(r2.out.trim(), 'Renamed aaaaaaaa to "Second Title".');

  // Rename an untitled session -> omits was
  const r3 = await run(["rename", ID_B.slice(0, 8), "First Time Named"], w);
  assert.equal(r3.out.trim(), 'Renamed bbbbbbbb to "First Time Named".');
});

test("rename works via real CLI process (runCli)", () => {
  const w = world("rename-cli");
  session(w, { id: ID_A, project: "app", prompt: "CLI integration test" });

  const r = runCli(["rename", ID_A.slice(0, 8), "CLI Renamed Title", "--json"], { cwd: w.base, env: w.env });
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, true);
  assert.equal(j.title, "CLI Renamed Title");
});
