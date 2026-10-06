/** A shorter presentation of one section's already-rendered status. */
export interface SectionStatus {
  label: "Enrolled" | "Open" | "Waitlist" | "Closed";
  tone: "enrolled" | "open" | "waitlist" | "closed";
  detail: string;
}

/** Unknown wording stays native. Counts are capacity facts, never queue positions. */
export function formatSectionStatus(value: string): SectionStatus | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length > 160) return null;
  if (/^Enrolled(?:\s+Class Full\s*\(\d{1,6}\))?$/i.test(text)) {
    return { label: "Enrolled", tone: "enrolled", detail: "" };
  }
  if (/^Closed(?:\s+Class Full\s*\(\d{1,6}\))?$/i.test(text)) {
    return { label: "Closed", tone: "closed", detail: "" };
  }
  if (/^Open$/i.test(text)) return { label: "Open", tone: "open", detail: "" };
  if (/^Waitlist(?:ed)?(?:\s+Class Full\s*\(\d{1,6}\))?$/i.test(text)) {
    return { label: "Waitlist", tone: "waitlist", detail: "" };
  }
  const counted = /^(Enrolled|Open|Waitlist(?:ed)?|Closed)\s*:?\s+(\d{1,6})\s+of\s+(\d{1,6})\s+(Left|Taken)$/i.exec(text);
  if (!counted) return null;
  const [, state, rawCount, rawCapacity, meaning] = counted;
  const count = Number(rawCount);
  const capacity = Number(rawCapacity);
  if (capacity < 1 || count > capacity) return null;
  if (/^Enrolled$/i.test(state)) {
    return { label: "Enrolled", tone: "enrolled", detail: /^Left$/i.test(meaning) ? `${count} ${count === 1 ? "seat" : "seats"} left` : `${count}/${capacity} places filled` };
  }
  if (/^Closed$/i.test(state) && count === 0 && /^Left$/i.test(meaning)) {
    return { label: "Closed", tone: "closed", detail: "0 seats left" };
  }
  if (/^Open$/i.test(state) && /^Left$/i.test(meaning)) {
    return { label: "Open", tone: "open", detail: `${count} ${count === 1 ? "seat" : "seats"} left` };
  }
  if (/^Waitlist/i.test(state) && /^Taken$/i.test(meaning)) {
    return { label: "Waitlist", tone: "waitlist", detail: `${count}/${capacity} places filled` };
  }
  return null;
}
