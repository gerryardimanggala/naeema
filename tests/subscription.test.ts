import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, extendUntil, isLocked, parseSubSettings, subscriptionState, trialUntil } from "../src/lib/subscription";
import { jakartaDay } from "../src/lib/time";

const now = new Date("2026-11-21T07:00:00Z"); // 21 Nov 14:00 WIB
const day = (d: Date) => jakartaDay(d);

test("tambah bulan kalender", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-11-21", 12), "2027-11-21");
});

test("perpanjangan dihitung dari tanggal habis kalau masih aktif, dari hari ini kalau sudah habis", () => {
  assert.equal(day(extendUntil(new Date("2026-12-10T16:59:59Z"), 1, now)), "2027-01-10");
  assert.equal(day(extendUntil(new Date("2026-10-01T16:59:59Z"), 3, now)), "2027-02-21");
  assert.equal(day(extendUntil(null, 1, now)), "2026-12-21");
  assert.equal(day(trialUntil(14, now)), "2026-12-05");
});

test("status langganan: aktif, segera habis, tenggang, habis, gratis", () => {
  const s = (until: string | null, free = false) => subscriptionState({ freePlan: free, paidUntil: until ? new Date(until) : null }, 3, now);
  assert.equal(s("2027-01-01T16:59:59Z").kind, "active");
  const soon = s("2026-11-25T16:59:59Z");
  assert.equal(soon.kind, "expiring");
  assert.equal(soon.kind === "expiring" && soon.daysLeft, 4);
  assert.equal(s("2026-11-21T16:59:59Z").kind, "expiring"); // habis malam ini
  const grace = s("2026-11-19T16:59:59Z");
  assert.equal(grace.kind, "grace");
  assert.equal(isLocked(grace), false);
  assert.equal(s("2026-11-10T16:59:59Z").kind, "expired");
  assert.equal(isLocked(s("2026-11-10T16:59:59Z")), true);
  assert.equal(isLocked(s(null)), true);
  assert.equal(s(null, true).kind, "free");
  assert.equal(isLocked(s("2020-01-01T00:00:00Z", true)), false);
});

test("pengaturan langganan: bawaan dan nilai tersimpan", () => {
  assert.deepEqual(parseSubSettings(() => undefined), { priceMonthly: 0, trialDays: 14, graceDays: 3, payInfo: "" });
  const v: Record<string, string> = { "sub.priceMonthly": "99000", "sub.trialDays": "7", "sub.graceDays": "0", "sub.payInfo": "BCA" };
  assert.deepEqual(parseSubSettings((k) => v[k]), { priceMonthly: 99000, trialDays: 7, graceDays: 0, payInfo: "BCA" });
});
