export interface JournalEntry {
  hash: string;
}

export type JournalReadiness =
  { ready: true } | { missingHashes: string[]; ready: false };

export function journalContainsRequiredHashes(
  journal: readonly JournalEntry[],
  requiredHashes: readonly string[],
): JournalReadiness {
  const present = new Set(journal.map((entry) => entry.hash));
  const missingHashes = requiredHashes.filter((hash) => !present.has(hash));

  if (missingHashes.length > 0) {
    return { missingHashes, ready: false };
  }

  return { ready: true };
}
