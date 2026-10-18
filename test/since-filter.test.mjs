import test from "node:test";
import assert from "node:assert/strict";
import { DAY, NOW, run, runCli, session, snapshot, world } from "./helpers.mjs";

const A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const B = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const C = "cccccccc-1111-4111-8111-cccccccccccc";
const D = "dddddddd-1111-4111-8111-dddddddddddd";
const E = "eeeeeeee-1111-4111-8111-eeeeeeeeeeee";
const STAMP_OFFSET_DAYS = 9 * 60 * 1000 / DAY; // session() ends its transcript nine minutes after its stamp

test("list --since validates a whole number of days without touching the config", async () => {
  const w = world("since-invalid");
  const before = snapshot(w.claude);
  for (const bad of ["0", "-1", "x", "1.5", "", "9007199254740992"]) {
    const r = await run(["list", `--since=${bad}`], w);
    assert.equal(r.code, 1);
    assert.match(r.err, /--since needs a whole number, 1 or more/);
  }
  assert.match((await run(["list", "--since"], w)).err, /--since needs a value/);
  assert.deepEqual(snapshot(w.claude), before);
});

test("list --since uses transcript activity, includes the cutoff, and excludes future activity", async () => {
  const w = world("since-boundary");
  session(w, { id: A, ageDays: 30, stampDays: 1 }); // old file, recent activity
  session(w, { id: B, ageDays: 1, stampDays: 30 }); // recent file, old activity
  session(w, { id: C, ageDays: 1, stampDays: 7 - STAMP_OFFSET_DAYS }); // activity exactly at the cutoff
  session(w, { id: D, ageDays: 1, stampDays: -1 }); // a future timestamp is outside the window
  session(w, { id: E, ageDays: 1, stampDays: 8 });
  const before = snapshot(w.claude);
  const all = JSON.parse((await run(["list", "--all", "--json"], w)).out);
  const r = await run(["list", "--all", "--since", "7", "--json"], w);
  assert.equal(r.code, 0, r.all);
  const j = JSON.parse(r.out);
  assert.equal(j.total, 5);
  assert.equal(j.matched, 2);
  assert.equal(j.shown, 2);
  assert.equal(j.since, 7);
  assert.deepEqual(j.sessions, all.sessions.filter((s) => [A, C].includes(s.id)));
  assert.deepEqual(snapshot(w.claude), before, "listing does not change sessions");
  const unfiltered = JSON.parse((await run(["list", "--all", "--json"], w)).out);
  assert.ok(!Object.hasOwn(unfiltered, "since"));
  assert.ok(!Object.hasOwn(unfiltered, "matched"));
});

test("list --since filters before --limit for every sort and combines with scope, due and title", async () => {
  const w = world("since-combine");
  const shop = w.project("shop");
  session(w, { id: A, project: "shop", ageDays: 29, stampDays: 1, prompt: "Stripe setup" });
  session(w, { id: B, project: "shop", ageDays: 29, stampDays: 1, prompt: "Stripe migration" });
  session(w, { id: C, project: "shop", ageDays: 1, stampDays: 8, prompt: "Stripe old activity" });
  session(w, { id: D, project: "other", ageDays: 29, stampDays: 1, prompt: "Stripe elsewhere" });
  session(w, { id: E, project: "shop", ageDays: 29, stampDays: 1, prompt: "Unrelated" });

  for (const sort of ["age", "size", "prompts"]) {
    const all = JSON.parse((await run(["list", "--all", "--sort", sort, "--json"], w)).out);
    const args = ["list", "--all", "--since", "7", "--title", "STRIPE", "--due", "7", "--sort", sort, "--json"];
    const filtered = JSON.parse((await run(args, w)).out);
    const expected = all.sessions.filter((s) => [A, B, D].includes(s.id));
    assert.equal(filtered.total, 5, sort);
    assert.equal(filtered.matched, 3, sort);
    assert.equal(filtered.since, 7, sort);
    assert.equal(filtered.title, "STRIPE", sort);
    assert.deepEqual(filtered.sessions, expected, sort);
    const limited = JSON.parse((await run([...args, "--limit", "1"], w)).out);
    assert.equal(limited.matched, 3, sort);
    assert.equal(limited.shown, 1, sort);
    assert.deepEqual(limited.sessions, expected.slice(0, 1), sort);
  }

  const scoped = JSON.parse((await run(["list", "--project", shop, "--since", "7", "--title", "stripe", "--due", "7", "--json"], w, { cwd: w.base })).out);
  assert.equal(scoped.total, 4);
  assert.equal(scoped.matched, 2);
  assert.deepEqual(scoped.sessions.map((s) => s.id), [A, B]);
});

test("list --since reports matched and shown counts in text, markdown and JSON, including no matches", async () => {
  const w = world("since-header");
  const s = session(w, { id: A, ageDays: 1, stampDays: 1 });
  session(w, { id: B, ageDays: 2, stampDays: 2 });
  session(w, { id: C, ageDays: 20, stampDays: 20 });
  for (const format of [[], ["--markdown"]]) {
    const r = await run(["list", "--since", "7", ...format], w, { cwd: s.root });
    assert.equal(r.code, 0, r.all);
    assert.ok(r.out.includes("(2 with activity in the last 7 days, of 3, newest first)"));
    const limited = await run(["list", "--since", "7", "--limit", "1", ...format], w, { cwd: s.root });
    assert.ok(limited.out.includes("(1 of 2 with activity in the last 7 days, of 3, newest first)"));
    const empty = await run(["list", "--since", "1", ...format], w, { cwd: s.root });
    assert.equal(empty.code, 0);
    assert.ok(empty.out.includes("(0 with activity in the last 1 day, of 3, newest first)"));
    assert.match(empty.out, /No sessions\./);
    assert.ok(!empty.out.includes("No Claude Code sessions found"));
  }
  const json = JSON.parse((await run(["list", "--since", "7", "--json"], w, { cwd: s.root })).out);
  assert.equal(json.matched, 2);
  assert.equal(json.total, 3);
  assert.equal(json.since, 7);
  const empty = JSON.parse((await run(["list", "--since", "1", "--json"], w, { cwd: s.root })).out);
  assert.equal(empty.matched, 0);
  assert.deepEqual(empty.sessions, []);
});

test("list --since works in the real CLI with an isolated config", () => {
  const w = world("since-process");
  session(w, { id: A, mtime: Date.now() - DAY, prompt: "recent activity" });
  session(w, { id: B, mtime: Date.now() - 30 * DAY, prompt: "old activity" });
  const before = snapshot(w.claude);
  const r = runCli(["list", "--all", "--since", "7", "--markdown"], { cwd: w.base, env: w.env });
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /1 with activity in the last 7 days, of 2/);
  assert.match(r.out, /recent activity/);
  assert.ok(!r.out.includes("old activity"));
  assert.deepEqual(snapshot(w.claude), before);
});
