function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeSubject(value) {
  const slug = toSlug(value);
  if (slug === "english") return "english";
  if (slug === "maths" || slug === "math") return "maths";
  if (slug === "evs" || slug === "environmental-studies") return "evs";
  return "general";
}

export function getSubjectLabel(value) {
  const subject = normalizeSubject(value);
  if (subject === "english") return "English";
  if (subject === "maths") return "Maths";
  if (subject === "evs") return "EVS";
  return "Worksheet";
}

export function getSubjectBadgeClass(value) {
  return `subject-thumb subject-thumb--${normalizeSubject(value)}`;
}
