"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ApplicationStore, normalize } = require("../lib/store");

test("validates required fields and URLs", () => {
  assert.throws(() => normalize({ company: "", role: "", status: "Unknown" }));
  assert.throws(() => normalize({
    company: "Acme",
    role: "Developer",
    status: "Applied",
    link: "javascript:alert(1)"
  }));
});

test("supports the complete application lifecycle", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "applytrack-"));
  const store = new ApplicationStore(path.join(directory, "applications.json"));
  const created = await store.create({
    company: "Acme",
    role: "Frontend Developer",
    status: "Applied",
    location: "Remote"
  });

  assert.equal((await store.list()).length, 1);
  assert.equal((await store.list({ query: "front" })).length, 1);
  assert.equal((await store.list({ status: "Interview" })).length, 0);

  const updated = await store.update(created.id, { status: "Interview" });
  assert.equal(updated.status, "Interview");
  assert.deepEqual(
    { total: (await store.stats()).total, interviews: (await store.stats()).interviews },
    { total: 1, interviews: 1 }
  );

  await store.remove(created.id);
  assert.equal((await store.list()).length, 0);
});
