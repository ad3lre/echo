/** Leave individual stored bits intact when their combined editor toggle did not change. */
export function preserveUnchangedPermissionPairs(
  edited: Set<string>,
  mapping: Record<string, string | readonly string[]>,
  current: Record<string, boolean>,
  original: Record<string, boolean>,
  stored: readonly string[],
): void {
  if (current.administrator) return;
  for (const [key, bits] of Object.entries(mapping)) {
    if (typeof bits === 'string' || current[key] !== original[key]) continue;
    bits
      .filter((bit) => !stored.includes(bit))
      .forEach((bit) => edited.delete(bit));
  }
}
