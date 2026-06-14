<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { Embed } from '@shared/types';
import {
  playableIframeSrc,
  resolvePlayableVideoEmbed,
} from '@shared/videoEmbedIds';
import { urlHostnameMatchesSuffix } from '@/utils/hostMatches';
import MessageEmbedRemoteImg from './MessageEmbedRemoteImg.vue';
import MessageEmbedMarkdown from './MessageEmbedMarkdown.vue';

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
      : 'max-w-[min(100%,32rem)]';
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

function formatEmbedTimestamp(raw: string | undefined): string {
  const s = raw?.trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function embedHasFooter(embed: Embed): boolean {
  return Boolean(embed.footer?.text?.trim() || embed.timestamp?.trim());
}

const list = computed(() => (props.embeds ?? []).filter((e) => !e.echoJump));
</script>

<template>
  <div class="message-link-embeds flex flex-col gap-2.5" v-spoiler-reveal>
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
              class="mt-1 flex min-w-0 items-center gap-2 text-sm font-semibold leading-snug text-fg"
            >
              <MessageEmbedRemoteImg
                v-if="embed.author.icon_url"
                :src="embed.author.icon_url"
                alt=""
                img-class="block h-5 w-5 rounded-full object-cover"
                compact
              />
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
            <MessageEmbedMarkdown
              v-if="embed.description"
              as="p"
              class="mt-1 break-words text-xs leading-snug text-[#b5bac1]"
              :text="embed.description"
            />
            <div
              v-if="embed.fields?.length"
              class="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3"
            >
              <div
                v-for="(field, fi) in embed.fields"
                :key="`${fi}-${field.name}`"
                :class="field.inline ? 'sm:col-span-1' : 'sm:col-span-3'"
              >
                <div
                  class="text-[11px] font-semibold leading-snug text-[#f2f3f5]"
                >
                  {{ field.name }}
                </div>
                <div
                  class="mt-0.5 break-words text-[11px] leading-snug text-[#b5bac1]"
                >
                  <MessageEmbedMarkdown :text="field.value" />
                </div>
              </div>
            </div>
            <div
              v-if="embedHasFooter(embed)"
              class="mt-2 flex min-w-0 items-center gap-2 text-[10px] leading-snug text-fg-subtle"
            >
              <MessageEmbedRemoteImg
                v-if="embed.footer?.icon_url"
                :src="embed.footer.icon_url"
                alt=""
                img-class="block h-4 w-4 rounded-full object-cover"
                compact
              />
              <span v-if="embed.footer?.text" class="min-w-0 break-words">{{
                embed.footer.text
              }}</span>
              <span
                v-if="embed.timestamp"
                class="shrink-0 before:mx-1 before:content-['•'] first:before:content-none"
              >
                {{ formatEmbedTimestamp(embed.timestamp) }}
              </span>
            </div>
          </div>

          <div
            v-if="playableVideo(embed)"
            class="group relative -mx-px -mb-px mt-0 aspect-video w-full overflow-hidden border-t border-border bg-black"
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
        <div
          v-else
          class="relative flex min-w-0 flex-1 flex-col py-2.5 pl-1 pr-3"
        >
          <div class="flex min-w-0 gap-3">
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
                class="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
              >
                <MessageEmbedRemoteImg
                  v-if="embed.author.icon_url"
                  :src="embed.author.icon_url"
                  alt=""
                  img-class="block h-4 w-4 rounded-full object-cover"
                  compact
                />
                <span>{{ embed.author.name }}</span>
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
              <MessageEmbedMarkdown
                v-if="embed.description"
                as="p"
                class="mt-1 break-words text-xs leading-snug text-[#b5bac1]"
                :text="embed.description"
              />
            </div>
          </div>
          <div
            v-if="embed.fields?.length"
            class="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3"
          >
            <div
              v-for="(field, fi) in embed.fields"
              :key="`${fi}-${field.name}`"
              :class="field.inline ? 'sm:col-span-1' : 'sm:col-span-3'"
            >
              <div
                class="text-[11px] font-semibold leading-snug text-[#f2f3f5]"
              >
                {{ field.name }}
              </div>
              <div
                class="mt-0.5 break-words text-[11px] leading-snug text-[#b5bac1]"
              >
                <MessageEmbedMarkdown :text="field.value" />
              </div>
            </div>
          </div>
          <div
            v-if="embedHasFooter(embed)"
            class="mt-2 flex min-w-0 items-center gap-2 text-[10px] leading-snug text-fg-subtle"
          >
            <MessageEmbedRemoteImg
              v-if="embed.footer?.icon_url"
              :src="embed.footer.icon_url"
              alt=""
              img-class="block h-4 w-4 rounded-full object-cover"
              compact
            />
            <span v-if="embed.footer?.text" class="min-w-0 break-words">{{
              embed.footer.text
            }}</span>
            <span
              v-if="embed.timestamp"
              class="shrink-0 before:mx-1 before:content-['•'] first:before:content-none"
            >
              {{ formatEmbedTimestamp(embed.timestamp) }}
            </span>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.message-link-embeds :deep(.discord-embed-md) {
  white-space: normal;
}

.message-link-embeds :deep(.discord-embed-md u) {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.message-link-embeds :deep(.discord-embed-md-pre) {
  margin: 0.35em 0;
  padding: 0.45em 0.6em;
  border-radius: 6px;
  background: var(--md-code-bg);
  overflow-x: auto;
  max-width: 100%;
  font-size: 0.92em;
}

.message-link-embeds :deep(.discord-embed-md-inline) {
  padding: 0.1em 0.3em;
  border-radius: 4px;
  background: var(--md-inline-code-bg);
  font-size: 0.92em;
}

.message-link-embeds :deep(.discord-embed-md-pre code) {
  padding: 0;
  background: none;
}
</style>
