import { computed } from 'vue';
import { serverIcons } from '@/assets/serverIcons';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useServerStore } from '@/features/layout/server';

export interface MoreServersMockServer {
  id: string;
  name: string;
  icon: string;
  /** Wide header image when the server has one; otherwise the hero uses `icon`. */
  bannerImageUrl?: string;
  bannerPositionY?: number;
  vanityCode?: string;
  members: string;
  online: string;
  description: string;
  tags: string[];
  verified: boolean;
}

const EXTRA_COUNT = 25;

const ALL_SERVERS: MoreServersMockServer[] = [
  {
    id: 'catLandia',
    name: 'CatLandia',
    icon: serverIcons.catLandia,
    members: '18,412',
    online: '2,340',
    description:
      'The coziest corner of the internet for cat lovers — memes, pics, and pure chaos.',
    tags: ['Pets', 'Memes', 'Cute'],
    verified: true,
  },
  {
    id: 'starland',
    name: 'Starland',
    icon: serverIcons.starland,
    members: '9,871',
    online: '1,104',
    description:
      'Late-night stargazers and dreamers. Share your sky photos, astro news, and night thoughts.',
    tags: ['Astronomy', 'Photography', 'Chill'],
    verified: false,
  },
  {
    id: 'sushi',
    name: 'Sushi',
    icon: serverIcons.sushi,
    members: '6,140',
    online: '873',
    description:
      'A community dedicated to all things sushi — recipes, restaurant finds, and food photography.',
    tags: ['Food', 'Cooking', 'Japan'],
    verified: true,
  },
  {
    id: 'pocki',
    name: 'Pocki',
    icon: serverIcons.pocki,
    members: '4,302',
    online: '511',
    description:
      "Cozy friends, comfy vibes. Share what you're up to and hang out without pressure.",
    tags: ['Social', 'Cozy', 'Casual'],
    verified: false,
  },
  {
    id: 'melonie',
    name: 'Melonie',
    icon: serverIcons.melonie,
    members: '7,548',
    online: '990',
    description:
      'Soft music, ambient playlists, and community-curated vibes for focus and relaxation.',
    tags: ['Music', 'Lofi', 'Focus'],
    verified: false,
  },
  {
    id: 'beacon',
    name: 'Beacon',
    icon: serverIcons.beacon,
    members: '11,204',
    online: '1,658',
    description:
      'Fast-moving tech talk — dev news, open source drops, and build logs from the community.',
    tags: ['Tech', 'Dev', 'Open Source'],
    verified: true,
  },
  {
    id: 'space',
    name: 'Space Station',
    icon: serverIcons.space,
    members: '13,749',
    online: '2,011',
    description:
      "Science fiction, real science, space missions, and speculation about what's next for humanity.",
    tags: ['Sci-Fi', 'Science', 'Space'],
    verified: true,
  },
  {
    id: 'starch',
    name: 'Starch Guild',
    icon: serverIcons.starch,
    members: '5,630',
    online: '724',
    description:
      'Builders and makers sharing projects, tips, and creative problem-solving in every medium.',
    tags: ['Making', 'DIY', 'Creative'],
    verified: false,
  },
  ...Array.from({ length: EXTRA_COUNT }).map((_, idx) => {
    const n = idx + 1;
    const iconCycle = [
      serverIcons.catLandia,
      serverIcons.starland,
      serverIcons.sushi,
      serverIcons.pocki,
      serverIcons.melonie,
      serverIcons.beacon,
      serverIcons.space,
      serverIcons.starch,
    ];
    const icon = iconCycle[idx % iconCycle.length];
    return {
      id: `extra-${n}`,
      name: `Server ${String(n).padStart(2, '0')}`,
      icon,
      members: `${3_000 + n * 13}`,
      online: `${300 + n * 7}`,
      description:
        'Additional mock server for layout testing and scrolling behavior.',
      tags: ['Mock', `#${n.toString().padStart(2, '0')}`],
      verified: false,
    } as MoreServersMockServer;
  }),
];

export function useMoreServers() {
  const serverStore = useServerStore();

  const moreServersList = computed((): MoreServersMockServer[] => {
    if (echoSyncCapabilities.isMockDataMode) {
      return ALL_SERVERS;
    }
    const pinned = serverStore.pinnedMoreServers;
    const pinnedRank = (id: string) => {
      const i = pinned.findIndex((s) => s.id === id);
      return i === -1 ? 99_999 : i;
    };
    const mru = serverStore.serverRailMru;
    const mruRank = (id: string) => {
      const i = mru.indexOf(id);
      return i === -1 ? 99_999 : i;
    };
    const baseIdx = new Map(
      serverStore.servers.map((s, idx) => [s.id, idx] as const),
    );
    return [...serverStore.servers]
      .map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.imageUrl,
        bannerImageUrl: s.bannerImageUrl,
        bannerPositionY: s.bannerPositionY,
        vanityCode: s.vanityCode?.trim() || undefined,
        members: '',
        online: '',
        description: (s.description ?? '').trim(),
        tags: Array.isArray(s.tags) ? [...s.tags] : [],
        verified: false,
      }))
      .sort((a, b) => {
        const pr = pinnedRank(a.id) - pinnedRank(b.id);
        if (pr !== 0) return pr;
        const mr = mruRank(a.id) - mruRank(b.id);
        if (mr !== 0) return mr;
        return (baseIdx.get(a.id) ?? 0) - (baseIdx.get(b.id) ?? 0);
      });
  });

  const moreServersCount = computed(() => moreServersList.value.length);
  return { moreServersList, moreServersCount };
}

export { ALL_SERVERS };
