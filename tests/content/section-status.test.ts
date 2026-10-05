import { describe, expect, it } from "vitest";
import { formatSectionStatus } from "../../src/content/section-status";

describe("per-section status wording", () => {
  it.each([
    ["Enrolled", "Enrolled", ""],
    ["Enrolled Class Full (36)", "Enrolled", ""],
    ["Enrolled: 1 of 80 Left", "Enrolled", "1 seat left"],
    ["Enrolled: 0 of 3 Taken", "Enrolled", "0/3 places filled"],
    ["Enrolled\n6 of 180 Left", "Enrolled", "6 seats left"],
    ["Closed: 0 of 80 Left", "Closed", "0 seats left"],
    ["Closed Class Full (80)", "Closed", ""],
    ["Open: 12 of 80 Left", "Open", "12 seats left"],
    ["Open\n1 of 80 Left", "Open", "1 seat left"],
    ["Open: 0 of 80 Left", "Open", "0 seats left"],
    ["Waitlist\n1 of 8 Taken", "Waitlist", "1/8 places filled"],
    ["Waitlisted: 0 of 8 Taken", "Waitlist", "0/8 places filled"],
    ["Waitlisted Class Full (20)", "Waitlist", ""]
  ])("keeps the meaning of %s", (source, label, detail) => {
    expect(formatSectionStatus(source)).toMatchObject({ label, detail });
  });

  it.each([
    "Enrolled: 81 of 80 Left", "Closed: 1 of 80 Left", "Open: 81 of 80 Left", "Waitlist: 9 of 8 Taken", "Waitlist: 0 of 0 Taken",
    "Open: 12 of 80 Taken", "Waitlist: 2 of 8 Left", "Not Enrolled",
    "Open - restricted to majors", "Waitlist position 3", "Enrolled Pending"
  ])("leaves unfamiliar or contradictory wording native: %s", source => {
    expect(formatSectionStatus(source)).toBeNull();
  });
});
