export type GroupDmPanelRow = { id: string; name: string; pfp: string };

export function mapGroupDmsToPanelList(
  groupDMs: Record<string, { id: string; name: string; pfp?: string }>,
): GroupDmPanelRow[] {
  return Object.values(groupDMs).map((row) => ({
    id: row.id,
    name: row.name,
    pfp: row.pfp ?? '',
  }));
}
