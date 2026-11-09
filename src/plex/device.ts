// Keep the existing storage namespace so authorized device identities survive upgrades.
const key = "plexplore.client-id";
let memoryId: string | undefined;

// This identifier is public device metadata, not an authentication token.
export function getClientIdentifier(): string {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      const existing = storage().getItem(key);
      if (existing) return existing;
    } catch {
      /* Storage may be disabled; try the next scope. */
    }
  }
  memoryId ||= Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      storage().setItem(key, memoryId);
    } catch {
      /* In-memory use remains possible. */
    }
  }
  return memoryId;
}
