const namePattern = /^[\p{L}][\p{L} .'-]*$/u;

export function cleanBuyerName(raw: string | undefined): string | null {
  if (!raw) return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) return null;
  if (!namePattern.test(name)) return null;
  return name;
}
