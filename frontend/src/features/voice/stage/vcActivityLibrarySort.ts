import {
  isEchoNativeVcActivityKey,
  type EchoVcActivityKey,
} from '@shared/vcActivityCatalog';

export type VcActivityLibraryCardSortInput = {
  key: EchoVcActivityKey;
  title: string;
};

export function compareVcActivityLibraryCards(
  a: VcActivityLibraryCardSortInput,
  b: VcActivityLibraryCardSortInput,
  popularityByKey: Partial<Record<EchoVcActivityKey, number>>,
): number {
  const nativeA = isEchoNativeVcActivityKey(a.key) ? 0 : 1;
  const nativeB = isEchoNativeVcActivityKey(b.key) ? 0 : 1;
  if (nativeA !== nativeB) return nativeA - nativeB;

  const countA = popularityByKey[a.key] ?? 0;
  const countB = popularityByKey[b.key] ?? 0;
  if (countB !== countA) return countB - countA;

  const titleCmp = a.title.localeCompare(b.title, undefined, {
    sensitivity: 'base',
  });
  if (titleCmp !== 0) return titleCmp;

  return a.key.localeCompare(b.key);
}
