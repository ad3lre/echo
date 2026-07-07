<script setup lang="ts">
import { computed, toRef, unref, type MaybeRef } from 'vue';
import '@/features/voice/styles/wordlineActivity.scss';
import { useWordlineGame } from '@/features/voice/wordline/useWordlineGame';
import { useWordlineServerGame } from '@/features/voice/wordline/useWordlineServerGame';
import { WORDLE_SERVER_MODE } from '@shared/vcActivityCatalog';
import type { WordlineView } from '@shared/games/wordline';
import type { GameMode } from '@shared/games/wordline/core';

const props = defineProps<{
  accountUserId?: string | null;
  appBase?: string;
  wordlineView?: MaybeRef<WordlineView | null>;
  submitWordlineGuess?: (guess: string) => void;
  setWordlineMode?: (mode: GameMode) => void;
}>();

const serverView = computed(
  (): import('@shared/games/wordline').WordlineView | null =>
    WORDLE_SERVER_MODE ? (unref(props.wordlineView) ?? null) : null,
);

const g = WORDLE_SERVER_MODE
  ? useWordlineServerGame({
      wordlineView: computed(() => serverView.value),
      submitWordlineGuess: props.submitWordlineGuess ?? (() => {}),
      setWordlineMode: props.setWordlineMode ?? (() => {}),
      accountUserId: toRef(props, 'accountUserId'),
    })
  : useWordlineGame({
      accountUserId: toRef(props, 'accountUserId'),
      appBase: props.appBase ?? (import.meta.env.BASE_URL || '/'),
      markDailyReminderOnWin: true,
    });
</script>

<template>
  <div
    class="wordline-root"
    :data-wordline-theme="g.theme === 'dark' ? 'dark' : undefined"
    @keydown.stop
  >
    <main class="shell">
      <header class="wordline-header" aria-label="Wordline">
        <div class="wordline-header__brand">
          <span class="wordline-header__mark">Wordline</span>
          <span class="wordline-header__mode">{{ g.modeEyebrow }}</span>
        </div>
        <div class="wordline-header__actions">
          <button
            class="icon-button"
            type="button"
            :aria-label="
              g.theme === 'dark'
                ? 'Switch to light theme'
                : 'Switch to dark theme'
            "
            title="Theme"
            @click="g.toggleTheme()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4L17 7m-10 10-1.4 1.4m0-12.8L7 7m10 10 1.4 1.4"
              />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </button>
          <button
            class="icon-button mode-button"
            type="button"
            :class="
              g.state.mode === 'daily'
                ? 'mode-button--daily'
                : 'mode-button--levels'
            "
            :aria-label="
              g.state.mode === 'daily'
                ? 'Daily puzzle. Switch to level practice.'
                : 'Level practice. Switch to daily puzzle.'
            "
            :title="
              g.state.mode === 'daily'
                ? 'Switch to level practice'
                : 'Switch to daily puzzle'
            "
            @click="g.toggleMode()"
          >
            <span class="mode-button__inner">
              <svg
                v-if="g.state.mode === 'daily'"
                class="mode-button__icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <rect
                  x="3.5"
                  y="5.5"
                  width="17"
                  height="15"
                  rx="1.5"
                  fill="none"
                />
                <path d="M3.5 11h17" />
                <path d="M8 3.5v4M16 3.5v4" />
              </svg>
              <svg
                v-else
                class="mode-button__icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M3 19.5h18" />
                <path d="M5.5 19.5V13h13v6.5" />
                <path d="M8 13V7.5h8V13" />
              </svg>
              <span class="mode-button__label">{{
                g.state.mode === 'daily' ? 'Daily' : 'Levels'
              }}</span>
            </span>
          </button>
        </div>
      </header>

      <section class="game" aria-label="Wordline puzzle">
        <div class="meta">
          <span class="meta__round">{{ g.roundLabel }}</span>
          <span class="meta__progress">{{ g.progressLabel }}</span>
        </div>

        <div class="board" aria-label="Guess board">
          <div v-for="(row, ri) in g.displayRows" :key="ri" class="row">
            <template v-for="(cell, ci) in row" :key="ci">
              <button
                v-if="g.activeGuessRowIndex === ri"
                type="button"
                class="tile"
                :class="[
                  cell.filled ? 'filled' : '',
                  cell.mark !== 'empty' ? cell.mark : '',
                  g.caretHighlightColumn === ci ? 'caret' : '',
                ]"
                :aria-label="`Column ${ci + 1}, tap to edit`"
                @click="g.selectCell(ri, ci)"
              >
                {{ cell.letter.toUpperCase() }}
              </button>
              <div
                v-else
                class="tile"
                :class="[
                  cell.filled ? 'filled' : '',
                  cell.mark !== 'empty' ? cell.mark : '',
                ]"
              >
                {{ cell.letter.toUpperCase() }}
              </div>
            </template>
          </div>
        </div>

        <div class="legend" aria-label="Color legend">
          <span><i class="swatch correct" />Correct</span>
          <span><i class="swatch present" />Wrong spot</span>
          <span><i class="swatch absent" />Not in word</span>
        </div>

        <p
          class="toast"
          role="status"
          aria-live="polite"
          :class="{ show: !!g.toastMessage }"
        >
          {{ g.toastMessage }}
        </p>

        <button
          v-if="g.showLevelAction"
          class="primary inline-action"
          type="button"
          @click="g.handleLevelAction()"
        >
          {{ g.levelActionLabel }}
        </button>

        <div class="keyboard" aria-label="Keyboard">
          <div v-for="(row, ri) in g.KEYBOARD_ROWS" :key="ri" class="key-row">
            <button
              v-for="k in row"
              :key="k"
              class="key"
              :class="[
                k === 'Enter' || k === 'Backspace' ? 'wide' : '',
                g.keyMarks.get(k.toLowerCase()) ?? '',
              ]"
              type="button"
              :aria-label="k === 'Backspace' ? 'Delete' : k"
              @click="
                g.handleKey(
                  k === 'Backspace' ? 'Backspace' : k === 'Enter' ? 'Enter' : k,
                )
              "
            >
              {{ k === 'Backspace' ? '⌫' : k }}
            </button>
          </div>
        </div>
      </section>
    </main>

    <!-- Stats modal -->
    <dialog class="modal" :open="g.statsOpen" @click.self="g.statsOpen = false">
      <div class="modal-head">
        <h2>Results</h2>
        <button
          class="icon-button"
          type="button"
          aria-label="Close stats"
          @click="g.statsOpen = false"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div class="stats">
        <div class="stat-grid">
          <div>
            <b>{{ g.statsModel.stats.played }}</b
            ><span>Played</span>
          </div>
          <div>
            <b>{{ g.statsModel.winRate }}%</b><span>Win rate</span>
          </div>
          <div>
            <b>{{ g.statsModel.stats.streak }}</b
            ><span>Streak</span>
          </div>
          <div>
            <b>{{ g.statsModel.stats.maxStreak }}</b
            ><span>Best</span>
          </div>
        </div>
        <div class="bars">
          <div
            v-for="(count, i) in g.statsModel.stats.distribution"
            :key="i"
            class="bar-row"
          >
            <span>{{ i + 1 }}</span>
            <i
              :style="{
                width: `${Math.max(8, Math.round((count / g.statsModel.max) * 100))}%`,
              }"
              >{{ count }}</i
            >
          </div>
        </div>
      </div>
      <button class="primary" type="button" @click="g.copyShareGrid()">
        Share grid
      </button>
    </dialog>
  </div>
</template>
