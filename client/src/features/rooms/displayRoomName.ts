const knownTypos: Record<string, string> = { futurictic: 'Futuristic' }

/**
 * Customer-facing room name: drops the redundant word "Frame" ("Frame Old Story" → "Old Story",
 * "B&W Frame" → "B&W") and fixes known catalogue typos. The stored name is unchanged.
 */
export function displayRoomName(name: string) {
  const cleaned = name
    .split(/\s+/)
    .filter((word) => word && !/^frames?$/i.test(word))
    .map((word) => knownTypos[word.toLowerCase()] ?? word)
    .join(' ')
  return cleaned || name.trim()
}

/** P01, P02… room code shown on the cover. */
export const roomCode = (index: number) => `P${String(index + 1).padStart(2, '0')}`
