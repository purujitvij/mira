import test from "node:test";
import assert from "node:assert/strict";
import { groupConvs } from "../src/lib/convs";

test("groups by conversation, snippet from first user message, newest activity first", () => {
  const convs = groupConvs([
    { id: "a", role: "user", text: "old chat", at: "2026-08-29T10:00:00Z" },
    { id: "a", role: "assistant", text: "reply", at: "2026-08-29T10:00:05Z" },
    { id: "b", role: "assistant", text: "greeting", at: "2026-08-31T09:00:00Z" },
    { id: "b", role: "user", text: "new chat", at: "2026-08-31T09:00:10Z" },
  ]);
  assert.deepEqual(convs.map((c) => c.id), ["b", "a"]);
  assert.equal(convs[0].snippet, "new chat"); // assistant greeting doesn't become the snippet
  assert.equal(convs[1].snippet, "old chat");
  assert.equal(convs[1].last, "2026-08-29T10:00:05Z");
});

test("unsorted input still yields chronological snippet and last", () => {
  const convs = groupConvs([
    { id: "a", role: "user", text: "second", at: "2026-08-30T12:00:00Z" },
    { id: "a", role: "user", text: "first", at: "2026-08-30T11:00:00Z" },
  ]);
  assert.equal(convs[0].snippet, "first");
  assert.equal(convs[0].last, "2026-08-30T12:00:00Z");
});
