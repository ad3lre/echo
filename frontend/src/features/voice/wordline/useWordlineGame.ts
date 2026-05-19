import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type Ref,
} from 'vue';
import { withBasePath } from '@/features/layout/urlNavigation';
import {
  echoWordleAccountStorageKey,
  markEchoWordleDailyCompleteForReminder,
} from '@/features/voice/echoWordleAccountStore';
import { wordlineDailyCalendarKey } from '@/features/voice/wordline/wordlineDailyCalendar';
import {
  ANSWERS,
  KEYBOARD_ROWS,
  LEVEL_WORDS,
  MAX_GUESSES,
  WORD_LENGTH,
} from './wordlineConstants';
import type { GameMode, Mark, SaveState, Stats } from './wordlineGameCore';
import {
  dailyWordlineAnswer,
  formatWordlineDateLabel,
  markStrength,
  normalizeWordlineLevel,
  scoreWordlineGuess,
  wordlineLevelProgress,
  wordlineWinMessage,
} from './wordlineGameCore';

const LEGACY_STORAGE_KEY = 'daily-word-game';

function storageKeys(accountUserId: string | null | undefined) {
  const scope = echoWordleAccountStorageKey(accountUserId);
  return {
    stateDaily: `${scope}:wl:daily`,
    stateLevels: `${scope}:wl:levels`,
    stats: `${scope}:wl:stats`,
    theme: `${scope}:wl:theme`,
    mode: `${scope}:wl:mode`,
  };
}

function readSavedState(
  mode: GameMode,
  accountUserId: string | null,
): SaveState | null {
  const k = storageKeys(accountUserId);
  const raw =
    localStorage.getItem(mode === 'daily' ? k.stateDaily : k.stateLevels) ??
    localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveState;
  } catch {
    return null;
  }
}

function loadMode(accountUserId: string | null): GameMode {
  const raw = localStorage.getItem(storageKeys(accountUserId).mode);
  return raw === 'levels' ? 'levels' : 'daily';
}

function loadThemePref(accountUserId: string | null): 'light' | 'dark' {
  const saved = localStorage.getItem(storageKeys(accountUserId).theme);
  if (saved === 'light' || saved === 'dark') return saved;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'dark';
}

function createFallbackState(
  mode: GameMode,
  dayKey: string,
  accountUserId: string | null,
): SaveState {
  const level = normalizeWordlineLevel(0);
  return {
    dateKey: dayKey,
    mode,
    level,
    rows: [],
    marks: [],
    current: '',
    status: 'playing',
    solution:
      mode === 'levels' ? LEVEL_WORDS[level] : dailyWordlineAnswer(dayKey),
  };
}

function loadState(
  mode: GameMode,
  dayKey: string,
  accountUserId: string | null,
): SaveState {
  const fallback = createFallbackState(mode, dayKey, accountUserId);
  try {
    const saved = readSavedState(mode, accountUserId);
    if (!saved) return fallback;
    if (
      mode === 'daily' &&
      saved.mode === 'daily' &&
      saved.dateKey === dayKey
    ) {
      return { ...fallback, ...saved };
    }
    if (mode === 'levels' && saved.mode === 'levels') {
      const level = normalizeWordlineLevel(saved.level ?? 0);
      return {
        ...fallback,
        ...saved,
        dateKey: dayKey,
        level,
        solution: LEVEL_WORDS[level],
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function getStats(accountUserId: string | null): Stats {
  const empty: Stats = {
    played: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0],
    playedDates: [],
  };
  try {
    const raw = localStorage.getItem(storageKeys(accountUserId).stats);
    return { ...empty, ...JSON.parse(raw ?? '{}') } as Stats;
  } catch {
    return empty;
  }
}

export function useWordlineGame(opts: {
  accountUserId: Ref<string | null | undefined>;
  appBase: string;
  markDailyReminderOnWin: boolean;
}) {
  const uid = () => opts.accountUserId.value ?? null;
  const dayKey = ref(wordlineDailyCalendarKey());
  const initialMode = loadMode(uid());
  const theme = ref<'light' | 'dark'>(loadThemePref(uid()));
  const state = reactive<SaveState>(
    loadState(initialMode, dayKey.value, uid()),
  );
  const dictionaryReady = ref(false);
  const toastMessage = ref('');
  const statsOpen = ref(false);
  let messageTimer = 0;
  const validGuesses = ref<Set<string>>(new Set([...ANSWERS, ...LEVEL_WORDS]));
  /** Insert / replace index (0–4) or 5 when the caret sits after the last letter on a full row. */
  const cursorColumn = ref(0);

  function syncCaretToCurrent() {
    const L = state.current.length;
    const maxPos = L < WORD_LENGTH ? L : WORD_LENGTH;
    if (cursorColumn.value > maxPos) cursorColumn.value = maxPos;
    if (cursorColumn.value < 0) cursorColumn.value = 0;
  }

  /** After loading saved state or switching mode, default to typing at the end of the partial guess. */
  function alignCaretToTailOnEntry() {
    const L = state.current.length;
    cursorColumn.value = Math.min(L, WORD_LENGTH);
  }

  function focusTileColumn(col: number) {
    const L = state.current.length;
    if (L < WORD_LENGTH) {
      cursorColumn.value = Math.min(Math.max(0, col), L);
    } else {
      cursorColumn.value = Math.min(Math.max(0, col), WORD_LENGTH - 1);
    }
  }

  function insertLetter(ch: string) {
    const letter = ch.toLowerCase();
    if (!/^[a-z]$/.test(letter)) return;
    const L0 = state.current.length;
    if (L0 < WORD_LENGTH) {
      let c = cursorColumn.value;
      c = Math.min(Math.max(0, c), L0);
      state.current =
        state.current.slice(0, c) + letter + state.current.slice(c);
      state.current = state.current.slice(0, WORD_LENGTH);
      const L1 = state.current.length;
      cursorColumn.value = Math.min(c + 1, L1);
    } else {
      let c = cursorColumn.value;
      c = Math.min(Math.max(0, c), WORD_LENGTH - 1);
      state.current =
        state.current.slice(0, c) + letter + state.current.slice(c + 1);
      cursorColumn.value = Math.min(c + 1, WORD_LENGTH);
    }
    persistState();
  }

  function handleBackspace() {
    const s = state.current;
    if (!s.length) return;
    const c = cursorColumn.value;
    if (c <= 0) return;
    state.current = s.slice(0, c - 1) + s.slice(c);
    cursorColumn.value = c - 1;
    persistState();
  }

  function selectCell(rowIndex: number, colIndex: number) {
    if (state.status !== 'playing') return;
    if (
      rowIndex !== state.rows.length ||
      colIndex < 0 ||
      colIndex >= WORD_LENGTH
    )
      return;
    focusTileColumn(colIndex);
  }

  async function hydrateDictionary() {
    try {
      const url = withBasePath('/wordline/words-5.txt', opts.appBase);
      const response = await fetch(url);
      const words = (await response.text())
        .split('\n')
        .filter((word) => /^[a-z]{5}$/.test(word.trim().toLowerCase()))
        .map((w) => w.trim().toLowerCase());
      const next = new Set(validGuesses.value);
      for (const w of words) next.add(w);
      validGuesses.value = next;
    } catch {
      /* keep bundled guesses */
    } finally {
      dictionaryReady.value = true;
    }
  }

  async function hydrateSolution() {
    const mode = state.mode;
    const level = state.level;
    const dailyUrl = import.meta.env.VITE_DAILY_WORD_URL as string | undefined;
    let solution: string;
    if (mode === 'levels') {
      solution = LEVEL_WORDS[normalizeWordlineLevel(level)];
    } else if (dailyUrl?.trim()) {
      try {
        const response = await fetch(
          `${dailyUrl.trim()}?date=${encodeURIComponent(dayKey.value)}`,
          { cache: 'no-store' },
        );
        const data = (await response.json()) as {
          solution?: string;
          word?: string;
        };
        const word = (data.solution ?? data.word ?? '').toLowerCase();
        solution = /^[a-z]{5}$/.test(word)
          ? word
          : dailyWordlineAnswer(dayKey.value);
      } catch {
        solution = dailyWordlineAnswer(dayKey.value);
      }
    } else {
      solution = state.solution ?? dailyWordlineAnswer(dayKey.value);
    }
    if (state.mode !== mode || state.level !== level) return;
    state.solution = solution;
    persistState();
  }

  function persistState() {
    const k = storageKeys(uid());
    const key = state.mode === 'daily' ? k.stateDaily : k.stateLevels;
    localStorage.setItem(key, JSON.stringify(state));
  }

  function persistMode(mode: GameMode) {
    localStorage.setItem(storageKeys(uid()).mode, mode);
  }

  function persistTheme(t: 'light' | 'dark') {
    localStorage.setItem(storageKeys(uid()).theme, t);
  }

  function showMessage(message: string) {
    window.clearTimeout(messageTimer);
    toastMessage.value = message;
    messageTimer = window.setTimeout(() => {
      toastMessage.value = '';
    }, 1800);
  }

  function recordStats() {
    if (state.mode === 'levels') return;
    const stats = getStats(uid());
    if (stats.playedDates.includes(dayKey.value)) return;
    stats.playedDates.push(dayKey.value);
    stats.played += 1;
    if (state.status === 'won') {
      stats.wins += 1;
      stats.streak += 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      const di = Math.min(Math.max(state.rows.length - 1, 0), 5);
      stats.distribution[di] += 1;
      if (opts.markDailyReminderOnWin) {
        markEchoWordleDailyCompleteForReminder(
          echoWordleAccountStorageKey(opts.accountUserId.value),
          dayKey.value,
        );
      }
    } else {
      stats.streak = 0;
    }
    localStorage.setItem(storageKeys(uid()).stats, JSON.stringify(stats));
  }

  function submitGuess() {
    if (state.current.length !== WORD_LENGTH) {
      showMessage('Not enough letters.');
      return;
    }
    if (!dictionaryReady.value) {
      showMessage('Dictionary is still loading.');
      return;
    }
    if (!validGuesses.value.has(state.current.toLowerCase())) {
      showMessage('Not in the word list.');
      return;
    }
    const sol = state.solution ?? dailyWordlineAnswer(dayKey.value);
    const marks = scoreWordlineGuess(state.current, sol);
    state.rows.push(state.current);
    state.marks.push(marks);
    state.status = marks.every((m) => m === 'correct')
      ? 'won'
      : state.rows.length === MAX_GUESSES
        ? 'lost'
        : 'playing';
    state.current = '';
    cursorColumn.value = 0;
    if (state.status !== 'playing') {
      recordStats();
      showMessage(
        state.status === 'won'
          ? wordlineWinMessage({
              mode: state.mode,
              status: state.status,
              level: state.level,
            })
          : `Answer: ${sol.toUpperCase()}`,
      );
      if (state.mode === 'daily' && state.status === 'won') {
        window.setTimeout(() => {
          statsOpen.value = true;
        }, 750);
      }
    }
    persistState();
  }

  function handleKey(key: string) {
    if (state.status !== 'playing') {
      const solved =
        state.mode === 'levels' ? 'Tap next level.' : 'Already solved.';
      showMessage(
        state.status === 'won'
          ? solved
          : `Answer: ${(state.solution ?? '').toUpperCase()}`,
      );
      return;
    }
    if (key === 'Backspace') {
      handleBackspace();
      return;
    }
    if (key === 'Enter') {
      submitGuess();
      return;
    }
    if (/^[a-zA-Z]$/.test(key)) {
      insertLetter(key);
    }
  }

  function onDocKeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'Enter') {
      e.preventDefault();
      submitGuess();
      return;
    }
    if (k === 'Backspace') {
      e.preventDefault();
      handleKey('Backspace');
      return;
    }
    if (k === 'ArrowLeft') {
      e.preventDefault();
      cursorColumn.value = Math.max(cursorColumn.value - 1, 0);
      return;
    }
    if (k === 'ArrowRight') {
      e.preventDefault();
      const L = state.current.length;
      const maxPos = L < WORD_LENGTH ? L : WORD_LENGTH;
      cursorColumn.value = Math.min(cursorColumn.value + 1, maxPos);
      return;
    }
    if (k.length === 1 && /^[a-zA-Z]$/.test(k)) {
      e.preventDefault();
      handleKey(k);
    }
  }

  const displayRows = computed(() => {
    const rows: string[] = [...state.rows];
    if (state.status === 'playing' && rows.length < MAX_GUESSES) {
      rows.push(state.current);
    }
    const out: { letter: string; mark: Mark; filled: boolean }[][] = [];
    for (let rowIndex = 0; rowIndex < MAX_GUESSES; rowIndex++) {
      const guess = (rows[rowIndex] ?? '').slice(0, WORD_LENGTH);
      const marks = state.marks[rowIndex] ?? [];
      const rowCells = [];
      for (let j = 0; j < WORD_LENGTH; j++) {
        const letter = guess[j] ?? '';
        const mark = (marks[j] ?? 'empty') as Mark;
        rowCells.push({ letter, mark, filled: letter.length > 0 });
      }
      out.push(rowCells);
    }
    return out;
  });

  const activeGuessRowIndex = computed(() =>
    state.status === 'playing' ? state.rows.length : -1,
  );

  const caretHighlightColumn = computed(() => {
    const L = state.current.length;
    if (L < WORD_LENGTH) return Math.min(cursorColumn.value, L);
    return Math.min(cursorColumn.value, WORD_LENGTH - 1);
  });

  const keyMarks = computed(() => {
    const m = new Map<string, Mark>();
    state.rows.forEach((guess, rowIndex) => {
      guess.split('').forEach((letter, index) => {
        const mark = state.marks[rowIndex]?.[index] ?? 'empty';
        const prev = m.get(letter.toLowerCase()) ?? 'empty';
        if (markStrength(mark) > markStrength(prev)) {
          m.set(letter.toLowerCase(), mark);
        }
      });
    });
    return m;
  });

  const modeEyebrow = computed(() =>
    state.mode === 'daily' ? 'Daily word' : 'Level run',
  );
  const roundLabel = computed(() =>
    state.mode === 'daily'
      ? formatWordlineDateLabel(dayKey.value)
      : `Level ${state.level + 1} of ${LEVEL_WORDS.length}`,
  );
  const progressLabel = computed(() =>
    state.mode === 'daily'
      ? '6 tries'
      : `${wordlineLevelProgress({
          mode: state.mode,
          status: state.status,
          level: state.level,
        })} solved`,
  );

  const showLevelAction = computed(
    () => state.mode === 'levels' && state.status !== 'playing',
  );
  const levelActionLabel = computed(() =>
    state.status === 'lost' ? 'Try again' : 'Next level',
  );

  const statsModel = computed(() => {
    const stats = getStats(uid());
    const winRate = stats.played
      ? Math.round((stats.wins / stats.played) * 100)
      : 0;
    const max = Math.max(1, ...stats.distribution);
    return { stats, winRate, max };
  });

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
    persistTheme(theme.value);
  }

  function switchMode(mode: GameMode) {
    if (state.mode === mode) return;
    persistState();
    persistMode(mode);
    dayKey.value = wordlineDailyCalendarKey();
    Object.assign(state, loadState(mode, dayKey.value, uid()));
    alignCaretToTailOnEntry();
    void hydrateSolution();
    showMessage(mode === 'levels' ? 'Level mode.' : 'Daily mode.');
  }

  function toggleMode() {
    switchMode(state.mode === 'daily' ? 'levels' : 'daily');
  }

  function nextLevel() {
    if (state.mode !== 'levels') return;
    const level = normalizeWordlineLevel(state.level + 1);
    Object.assign(state, {
      dateKey: dayKey.value,
      mode: 'levels' as const,
      level,
      rows: [],
      marks: [],
      current: '',
      status: 'playing' as const,
      solution: LEVEL_WORDS[level],
    });
    cursorColumn.value = 0;
    persistState();
    showMessage(`Level ${level + 1}.`);
  }

  function retryLevel() {
    if (state.mode !== 'levels') return;
    Object.assign(state, {
      rows: [],
      marks: [],
      current: '',
      status: 'playing' as const,
      solution: LEVEL_WORDS[state.level % LEVEL_WORDS.length],
    });
    cursorColumn.value = 0;
    persistState();
    showMessage(`Level ${state.level + 1}.`);
  }

  function handleLevelAction() {
    if (state.status === 'lost') retryLevel();
    else nextLevel();
  }

  async function copyShareGrid() {
    const grid = state.marks
      .map((row) =>
        row
          .map(
            (mark) =>
              ({
                correct: '🟩',
                present: '🟨',
                absent: '⬛',
                empty: '⬜',
              })[mark],
          )
          .join(''),
      )
      .join('\n');
    const label =
      state.mode === 'daily' ? dayKey.value : `Level ${state.level + 1}`;
    const text = `Wordline ${label} ${state.status === 'won' ? state.rows.length : 'X'}/6\n${grid}`;
    await navigator.clipboard?.writeText(text);
    showMessage('Copied result.');
  }

  watch(
    () => opts.accountUserId.value,
    () => {
      dayKey.value = wordlineDailyCalendarKey();
      const m = loadMode(uid());
      Object.assign(state, loadState(m, dayKey.value, uid()));
      theme.value = loadThemePref(uid());
      alignCaretToTailOnEntry();
      void hydrateSolution();
    },
  );

  watch(
    () => state.current,
    () => {
      syncCaretToCurrent();
    },
  );

  onMounted(() => {
    dayKey.value = wordlineDailyCalendarKey();
    theme.value = loadThemePref(uid());
    const m = loadMode(uid());
    Object.assign(state, loadState(m, dayKey.value, uid()));
    alignCaretToTailOnEntry();
    void hydrateDictionary();
    void hydrateSolution();
    window.addEventListener('keydown', onDocKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onDocKeydown);
    window.clearTimeout(messageTimer);
  });

  return reactive({
    theme,
    state,
    dayKey,
    dictionaryReady,
    toastMessage,
    statsOpen,
    KEYBOARD_ROWS,
    displayRows,
    cursorColumn,
    activeGuessRowIndex,
    caretHighlightColumn,
    selectCell,
    keyMarks,
    modeEyebrow,
    roundLabel,
    progressLabel,
    showLevelAction,
    levelActionLabel,
    statsModel,
    handleKey,
    toggleTheme,
    toggleMode,
    handleLevelAction,
    copyShareGrid,
  });
}
