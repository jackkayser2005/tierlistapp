/** Ignore out-of-order socket payloads using the server monotonic seq. */
export function shouldApplySeq(
  lastSeqRef: { current: number },
  seq: unknown,
): boolean {
  if (typeof seq !== "number" || seq <= 0) return true;
  if (seq < lastSeqRef.current) return false;
  lastSeqRef.current = seq;
  return true;
}

export function resetSeq(lastSeqRef: { current: number }): void {
  lastSeqRef.current = 0;
}
