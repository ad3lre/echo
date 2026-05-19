<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { Embed } from '@shared/types';
import {
  playableIframeSrc,
  resolvePlayableVideoEmbed,
} from '@shared/videoEmbedIds';
import { urlHostnameMatchesSuffix } from '@/utils/hostMatches';
import MessageEmbedRemoteImg from './MessageEmbedRemoteImg.vue';

const props = defineProps<{
  embeds: Embed[];
}>();

/** Wider in-chat video embed (not host fullscreen). Keyed like the template `:key`. */
const videoExpandedByKey = ref<Record<string, boolean>>({});

function videoEmbedStateKey(i: number, embed: Embed) {
  return `${i}-${embed.url ?? embed.title ?? ''}`;
}

function isVideoExpanded(i: number, embed: Embed) {
  return Boolean(videoExpandedByKey.value[videoEmbedStateKey(i, embed)]);
}

const VIDEO_EXPAND_SCROLL_AFTER_MS = 320;

async function toggleVideoExpand(i: number, embed: Embed, event: MouseEvent) {
  const k = videoEmbedStateKey(i, embed);
  const next = !videoExpandedByKey.value[k];
  videoExpandedByKey.value = { ...videoExpandedByKey.value, [k]: next };
  if (!next) return;

  const article = (event.currentTarget as HTMLElement | null)?.closest(
    'article.message-link-embed',
  );
  if (!(article instanceof HTMLElement)) return;

  const scrollEmbedIntoView = () => {
    article.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  };

  await nextTick();
  const reducedMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  )?.matches;
  if (reducedMotion) {
    requestAnimationFrame(() => requestAnimationFrame(scrollEmbedIntoView));
    return;
  }
  window.setTimeout(scrollEmbedIntoView, VIDEO_EXPAND_SCROLL_AFTER_MS);
}

function videoArticleMaxClass(i: number, embed: Embed) {
  if (!playableVideo(embed)) {
    /** Image / OG-style cards can read wider than compact text-only previews. */
    return embed.image?.url?.trim()
      ? 'max-w-[min(100%,min(92vw,36rem))]'
      : 'max-w-[min(100%,480px)]';
  }
  return isVideoExpanded(i, embed)
    ? 'max-w-[min(100%,min(92vw,56rem))]'
    : 'max-w-[min(100%,420px)]';
}

const iframeAllow = (() => {
  const base =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  try {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      return `${base}; web-share`;
    }
  } catch {
    // ignore
  }
  return base;
})();

function accentFromEmbed(embed: Embed): string {
  if (embed.color != null && embed.color >= 0) {
    const n = Math.min(0xffffff, Math.max(0, Math.floor(embed.color)));
    return `#${n.toString(16).padStart(6, '0')}`;
  }
  const u = embed.url?.trim() ?? '';
  if (!u) return '#3ba55d';
  if (
    urlHostnameMatchesSuffix(u, 'youtube.com') ||
    urlHostnameMatchesSuffix(u, 'youtu.be')
  ) {
    return '#ff0000';
  }
  if (urlHostnameMatchesSuffix(u, 'vimeo.com')) return '#1ab7ea';
  if (
    urlHostnameMatchesSuffix(u, 'twitter.com') ||
    urlHostnameMatchesSuffix(u, 'x.com')
  ) {
    return '#1d9bf0';
  }
  return '#3ba55d';
}

function playableVideo(embed: Embed) {
  return resolvePlayableVideoEmbed(embed);
}

function videoIframeSrc(embed: Embed): string {
  const ref = playableVideo(embed);
  return ref ? playableIframeSrc(ref) : '';
}

function embedMediaHasDims(
  media: { width?: number; height?: number } | undefined,
): boolean {
  const w = media?.width;
  const h = media?.height;
  return typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0;
}

function embedMediaAspectStyle(
  media: { width?: number; height?: number } | undefined,
): { aspectRatio: string } | undefined {
  const w = media?.width;
  const h = media?.height;
  if (typeof w !== 'number' || w <= 0 || typeof h !== 'number' || h <= 0) {
    return undefined;
  }
  return { aspectRatio: `${w} / ${h}` };
}

function embedMainImageImgClass(
  media: { width?: number; height?: number } | undefined,
  hoverScale = true,
) {
  const scale = hoverScale
    ? ' transition-transform duration-300 group-hover:scale-[1.02]'
    : '';
  return embedMediaHasDims(media)
    ? `h-full w-full object-contain${scale}`
    : `block h-auto max-h-[min(90vh,36rem)] w-full object-contain${scale}`;
}

function embedThumbImgClass(
  media: { width?: number; height?: number } | undefined,
) {
  return embedMediaHasDims(media)
    ? 'block h-16 w-16 object-contain'
    : 'block max-h-16 max-w-24 object-contain';
}

function isRichMedia(embed: Embed): boolean {
  return Boolean(embed.image?.url?.trim()) || playableVideo(embed) != null;
}

const list = computed(() => (props.embeds ?? []).filter((e) => !e.echoJump));
</script>

<template>
  <div class="message-link-embeds flex flex-col gap-2.5">
    <article
      v-for="(embed, i) in list"
      :key="`${i}-${embed.url ?? embed.title ?? ''}`"
      class="message-link-embed relative w-full overflow-hidden rounded-lg bg-elevated shadow-md transition-[max-width] duration-300 ease-out"
      :class="[
        isRichMedia(embed) ? 'message-link-embed--rich' : '',
        videoArticleMaxClass(i, embed),
        isVideoExpanded(i, embed) ? 'scroll-my-4' : '',
      ]"
      :aria-label="
        embed.title ? `Link preview: ${embed.title}` : 'Link preview'
      "
    >
      <div class="flex min-w-0">
        <div
          class="message-link-embed__accent w-1 shrink-0 self-stretch rounded-l-[inherit]"
          :style="{ background: accentFromEmbed(embed) }"
          aria-hidden="true"
        />

        <!-- Rich (video / large image): compact header + full-width thumb -->
        <div v-if="isRichMedia(embed)" class="min-w-0 flex-1 flex flex-col">
          <div class="px-3 pb-2 pt-3">
            <div
              v-if="embed.provider"
              class="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle"
            >
              {{ embed.provider }}
            </div>
            <div
              v-if="embed.author?.name"
              class="mt-1 text-sm font-semibold leading-snug text-fg"
            >
              <a
                v-if="embed.author.url"
                :href="embed.author.url"
                class="hover:underline"
                target="_blank"
                rel="noopener noreferrer"
                @click.stop
              >
                {{ embed.author.name }}
              </a>
              <span v-else>{{ embed.author.name }}</span>
            </div>
            <h3 class="mt-1 text-[15px] font-semibold leading-snug">
              <a
                v-if="embed.url"
                :href="embed.url"
                class="text-[#00a8fc] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
                @click.stop
              >
                {{ embed.title || 'Open link' }}
              </a>
              <span v-else class="text-[#f2f3f5]">{{ embed.title }}</span>
            </h3>
            <p
              v-if="embed.description"
              class="mt-1 line-clamp-2 text-xs leading-snug text-[#b5bac1]"
            >
              {{ embed.description }}
            </p>
          </div>

          <div
            v-if="playableVideo(embed)"
            class="group relative -mx-px -mb-px mt-0 aspect-video w-full overflow-hidden border-t border-white/[0.06] bg-black"
          >
            <button
              type="button"
              class="absolute right-2 top-2 z-[1] rounded-md bg-overlay-heavy px-2 py-1 text-[11px] font-semibold text-fg shadow-md backdrop-blur-sm ring-1 ring-border transition-opacity duration-150 pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 hover:bg-overlay-heavy focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8fc]"
              :aria-expanded="isVideoExpanded(i, embed)"
              :aria-label="
                isVideoExpanded(i, embed) ? 'Smaller embed' : 'Larger embed'
              "
              :title="
                isVideoExpanded(i, embed) ? 'Smaller embed' : 'Larger embed'
              "
              @click.stop="toggleVideoExpand(i, embed, $event)"
            >
              {{ isVideoExpanded(i, embed) ? 'Smaller' : 'Larger' }}
            </button>
            <iframe
              class="absolute inset-0 h-full w-full border-0"
              :src="videoIframeSrc(embed)"
              :title="
                embed.title
                  ? `Play video: ${embed.title}`
                  : 'Embedded video player'
              "
              :allow="iframeAllow"
              allowfullscreen
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
            />
          </div>

          <a
            v-else-if="embed.image?.url && embed.url"
            :href="embed.url"
            class="message-link-embed__media group relative mt-0 block w-full overflow-hidden bg-scrim-1"
            target="_blank"
            rel="noopener noreferrer"
            @click.stop
            :style="embedMediaAspectStyle(embed.image)"
          >
            <MessageEmbedRemoteImg
              :src="embed.image.url"
              alt=""
              :img-class="embedMainImageImgClass(embed.image, true)"
              rich-link-play-overlay
              :rich-link-overlay-fill="embedMediaHasDims(embed.image)"
            />
          </a>
          <div
            v-else-if="embed.image?.url"
            class="overflow-hidden bg-scrim-1"
            :style="embedMediaAspectStyle(embed.image)"
          >
            <MessageEmbedRemoteImg
              :src="embed.image.url"
              alt=""
              :img-class="embedMainImageImgClass(embed.image, false)"
            />
          </div>
        </div>

        <!-- Compact: thumbnail + text (non-video sites, small previews) -->
        <div v-else class="relative flex min-w-0 flex-1 gap-3 py-2.5 pl-1 pr-3">
          <div
            v-if="embed.thumbnail?.url"
            class="shrink-0 self-start overflow-hidden rounded-md bg-scrim-1"
            :style="embedMediaAspectStyle(embed.thumbnail)"
          >
            <MessageEmbedRemoteImg
              :src="embed.thumbnail.url"
              alt=""
              :img-class="embedThumbImgClass(embed.thumbnail)"
              compact
            />
          </div>
          <div class="min-w-0 flex-1 pt-0.5">
            <div
              v-if="embed.provider"
              class="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle"
            >
              {{ embed.provider }}
            </div>
            <div
              v-else-if="embed.author?.name"
              class="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
            >
              {{ embed.author.name }}
            </div>
            <h3
              class="mt-0.5 text-[15px] font-semibold leading-tight text-[#f2f3f5]"
            >
              <a
                v-if="embed.url"
                :href="embed.url"
                class="text-[#00a8fc] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
                @click.stop
              >
                {{ embed.title || embed.url }}
              </a>
              <span v-else>{{ embed.title }}</span>
            </h3>
            <p
              v-if="embed.description"
              class="mt-1 line-clamp-3 text-xs leading-snug text-[#b5bac1]"
            >
              {{ embed.description }}
            </p>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>
