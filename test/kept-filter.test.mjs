import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DAY, run, runCli, session, snapshot, world } from "./helpers.mjs";

const A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const B = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const C = "cccccccc-1111-4111-8111-cccccccccccc";
const D = "dddddddd-1111-4111-8111-dddddddddddd";
const E = "eeeeeeee-1111-4111-8111-eeeeeeeeeeee";

test("list --kept filters against a keep list written by keep and does not touch the config", async () => {
  const w = world("kept-basic");
  session(w, { id: A, project: "shop", ageDays: 10 });
  session(w, { id: B, project: "shop", ageDays: 10 });
  session(w, { id: C, project: "shop", ageDays: 10 });

  // Keep session A and B
  await run(["keep", A, B], w);
  const before = snapshot(w.claude);

  const all = JSON.parse((await run(["list", "--all", "--json"], w)).out);
  assert.equal(all.total, 3);
  assert.equal(all.shown, 3);
  assert.ok(!Object.hasOwn(all, "kept"));
  assert.ok(!Object.hasOwn(all, "matched"));

  const r = await run(["list", "--all", "--kept", "--json"], w);
  assert.equal(r.code, 0, r.all);
  const j = JSON.parse(r.out);
  assert.equal(j.total, 3);
  assert.equal(j.matched, 2);
  assert.equal(j.shown, 2);
  assert.equal(j.kept, true);
  assert.deepEqual(j.sessions.map((s) => s.id), [A, B]);

  assert.deepEqual(snapshot(w.claude), before, "listing does not change sessions or config");
});

test("list --kept filters before --limit for every sort and combines with scope, due, title, since and idle", async () => {
  const w = world("kept-combine");
  const shop = w.project("shop");
  session(w, { id: A, project: "shop", ageDays: 29, stampDays: 10, prompt: "Stripe setup" });
  session(w, { id: B, project: "shop", ageDays: 29, stampDays: 20, prompt: "Stripe migration" });
  session(w, { id: C, project: "shop", ageDays: 29, stampDays: 2, prompt: "Stripe recent" });
  session(w, { id: D, project: "other", ageDays: 29, stampDays: 15, prompt: "Stripe elsewhere" });
  session(w, { id: E, project: "shop", ageDays: 29, stampDays: 15, prompt: "Unrelated" });

  const keepPath = path.join(w.claude, "session-tidy", "keep.json");
  fs.mkdirSync(path.dirname(keepPath), { recursive: true });
  fs.writeFileSync(keepPath, JSON.stringify({ version: 1, kept: { [A]: {}, [B]: {}, [C]: {}, [D]: {} } }));

  for (const sort of ["age", "size", "prompts"]) {
    const all = JSON.parse((await run(["list", "--all", "--sort", sort, "--json"], w)).out);
    const args = ["list", "--all", "--kept", "--idle", "7", "--since", "25", "--title", "STRIPE", "--due", "7", "--sort", sort, "--json"];
    const filtered = JSON.parse((await run(args, w)).out);
    const expected = all.sessions.filter((s) => [A, B, D].includes(s.id));
    assert.equal(filtered.total, 5, sort);
    assert.equal(filtered.matched, 3, sort);
    assert.equal(filtered.kept, true, sort);
    assert.equal(filtered.idle, 7, sort);
    assert.equal(filtered.since, 25, sort);
    assert.equal(filtered.title, "STRIPE", sort);
    assert.deepEqual(filtered.sessions, expected, sort);

    // Limit after filter
    const limited = JSON.parse((await run([...args, "--limit", "1"], w)).out);
    assert.equal(limited.matched, 3, sort);
    assert.equal(limited.shown, 1, sort);
    assert.equal(limited.kept, true, sort);
    assert.deepEqual(limited.sessions, expected.slice(0, 1), sort);
  }

  // Scoped to project shop: A and B are kept, in shop, matching filters
  const scoped = JSON.parse((await run(["list", "--project", shop, "--kept", "--idle", "7", "--since", "25", "--title", "stripe", "--due", "7", "--json"], w, { cwd: w.base })).out);
  assert.equal(scoped.total, 4);
  assert.equal(scoped.matched, 2);
  assert.equal(scoped.kept, true);
  assert.deepEqual(scoped.sessions.map((s) => s.id), [A, B]);
});

test("list --kept reports matched and shown counts in text, markdown and JSON, including no matches", async () => {
  const w = world("kept-header");
  const s = session(w, { id: A, project: "shop", ageDays: 1, prompt: "stripe payment" });
  session(w, { id: B, project: "shop", ageDays: 2, prompt: "stripe invoice" });
  session(w, { id: C, project: "shop", ageDays: 3, prompt: "stripe webhook" });
  session(w, { id: D, project: "shop", ageDays: 4, prompt: "other work" });

  await run(["keep", A, B, C], w);

  for (const format of [[], ["--markdown"]]) {
    // 3 kept of 4 total
    const r = await run(["list", "--kept", ...format], w, { cwd: s.root });
    assert.equal(r.code, 0, r.all);
    assert.ok(r.out.includes("(3 kept, of 4, newest first)"));

    // Limited to 1: 1 of 3 kept, of 4
    const limited = await run(["list", "--kept", "--limit", "1", ...format], w, { cwd: s.root });
    assert.ok(limited.out.includes("(1 of 3 kept, of 4, newest first)"));

    // Combined with title: 2 kept, matching "stripe", of 4 (if only A and B match a sub-query or query)
    const withTitle = await run(["list", "--kept", "--title", "payment", ...format], w, { cwd: s.root });
    assert.ok(withTitle.out.includes('(1 kept, matching "payment", of 4, newest first)'));

    const withMultiTitle = await run(["list", "--kept", "--title", "stripe", "--limit", "2", ...format], w, { cwd: s.root });
    assert.ok(withMultiTitle.out.includes('(2 of 3 kept, matching "stripe", of 4, newest first)'));

    // Empty match with title
    const emptyMatch = await run(["list", "--kept", "--title", "nonexistent", ...format], w, { cwd: s.root });
    assert.equal(emptyMatch.code, 0);
    assert.ok(emptyMatch.out.includes('(0 kept, matching "nonexistent", of 4, newest first)'));
    assert.match(emptyMatch.out, /No sessions\./);
  }

  // When no sessions are kept at all
  const wEmpty = world("kept-none");
  const sEmpty = session(wEmpty, { id: A, project: "shop" });
  const empty = await run(["list", "--kept"], wEmpty, { cwd: sEmpty.root });
  assert.equal(empty.code, 0);
  assert.ok(empty.out.includes("(0 kept, of 1, newest first)"));
  assert.match(empty.out, /No sessions\./);
  assert.ok(!empty.out.includes("No Claude Code sessions found"));
});

test("list --kept is refused when the keep list is invalid, with exit 1", async () => {
  const w = world("kept-invalid");
  session(w, { id: A, project: "shop" });
  const keepPath = path.join(w.claude, "session-tidy", "keep.json");
  fs.mkdirSync(path.dirname(keepPath), { recursive: true });
  fs.writeFileSync(keepPath, "{ invalid json");

  const before = snapshot(w.claude);

  // --kept exits 1 with the reason
  const r = await run(["list", "--kept"], w);
  assert.equal(r.code, 1);
  assert.match(r.err, /keep\.json is not valid JSON, so I cannot tell which sessions are kept/);

  // regular list still runs with a warning
  const normal = await run(["list"], w);
  assert.equal(normal.code, 0);
  assert.match(normal.err, /keep\.json is not valid JSON; kept sessions are not marked/);

  assert.deepEqual(snapshot(w.claude), before);
});

test("list --kept works in the real CLI with an isolated config", () => {
  const w = world("kept-process");
  session(w, { id: A, prompt: "kept session" });
  session(w, { id: B, prompt: "unkept session" });
  const keepPath = path.join(w.claude, "session-tidy", "keep.json");
  fs.mkdirSync(path.dirname(keepPath), { recursive: true });
  fs.writeFileSync(keepPath, JSON.stringify({ version: 1, kept: { [A]: { since: new Date().toISOString() } } }));

  const before = snapshot(w.claude);
  const r = runCli(["list", "--all", "--kept", "--markdown"], { cwd: w.base, env: w.env });
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /1 kept, of 2/);
  assert.match(r.out, /kept session/);
  assert.ok(!r.out.includes("unkept session"));
  assert.deepEqual(snapshot(w.claude), before);
});
