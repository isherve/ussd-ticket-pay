/** Segments added since the last Africa's Talking callback. `text` is cumulative. */
export function newSegments(previous: string, incoming: string): string[] {
  if (incoming === previous) return [];
  if (previous.length === 0) {
    return incoming.split("*").filter((part) => part.length > 0);
  }
  const prefix = `${previous}*`;
  if (incoming.startsWith(prefix)) {
    return incoming.slice(prefix.length).split("*").filter((part) => part.length > 0);
  }
  const parts = incoming.split("*").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return last ? [last] : [];
}
