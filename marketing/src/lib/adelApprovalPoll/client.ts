import { ADEL_APPROVAL_QUESTIONS, CATEGORY_COLORS } from './questions';

export type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  countryCode: string;
  categoryScores: Record<string, number>;
  at: string;
};

type PollSnapshot = {
  alreadySubmitted: boolean;
  me: LeaderboardEntry | null;
  leaderboard: LeaderboardEntry[];
};

type CategoryScore = { name: string; color: string; score: number };

const CATEGORY_ICONS: Record<string, string> = {
  Friendship: '🤝',
  Humor: '😂',
  Thinking: '🧠',
  Judgment: '⚖️',
  Emotion: '💚',
  Freedom: '🗽',
  Community: '🏘️',
  Relationships: '💕',
  Closeness: '✨',
  Temperament: '⚡',
};

const RANK_MEDALS = ['🥇', '🥈', '🥉'] as const;

const questions = ADEL_APPROVAL_QUESTIONS;
const totalQuestions = questions.length;
const stateKey = 'adelPollStateV6';
const resultKey = 'adelPollResultV6';

type SavedResult = {
  name: string;
  score: number;
  categories: CategoryScore[];
  entryId: string | null;
  at: string;
};

const answers: Array<number | null> = Array(totalQuestions).fill(null);
let currentQuestion = 0;
let playerName = '';
let leaderboard: LeaderboardEntry[] = [];
let myEntryId: string | null = null;
let submitting = false;
let apiBase = '';
let activeTab: 'poll' | 'compare' = 'poll';

function esc(value: string): string {
  return String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[c]!,
  );
}

function flagEmoji(countryCode: string): string {
  const code = String(countryCode || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return '';
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  );
}

function saveState(): void {
  try {
    localStorage.setItem(
      stateKey,
      JSON.stringify({ answers, currentQuestion, playerName }),
    );
  } catch {
    /* ignore */
  }
}

function clearState(): void {
  try {
    localStorage.removeItem(stateKey);
  } catch {
    /* ignore */
  }
}

function loadState(): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(stateKey) || 'null');
    if (!saved || !saved.playerName) return false;
    playerName = String(saved.playerName).slice(0, 30);
    if (
      Array.isArray(saved.answers) &&
      saved.answers.length === totalQuestions
    ) {
      saved.answers.forEach((v: unknown, i: number) => {
        if (
          Number.isInteger(v) &&
          typeof v === 'number' &&
          v >= 0 &&
          v < questions[i]!.options.length
        ) {
          answers[i] = v;
        }
      });
    }
    if (Number.isInteger(saved.currentQuestion)) {
      currentQuestion = Math.max(
        0,
        Math.min(totalQuestions - 1, saved.currentQuestion as number),
      );
    }
    return true;
  } catch {
    return false;
  }
}

function saveResultSnapshot(opts: {
  name: string;
  score: number;
  categories: CategoryScore[];
  entryId?: string | null;
}): void {
  const payload: SavedResult = {
    name: opts.name,
    score: opts.score,
    categories: opts.categories,
    entryId: opts.entryId ?? myEntryId,
    at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(resultKey, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function loadResultSnapshot(): SavedResult | null {
  try {
    const saved = JSON.parse(localStorage.getItem(resultKey) || 'null');
    if (!saved || !saved.name || !Number.isFinite(saved.score)) return null;
    const categories = Array.isArray(saved.categories)
      ? (saved.categories as CategoryScore[]).filter(
          (c) =>
            c &&
            typeof c.name === 'string' &&
            typeof c.score === 'number' &&
            typeof c.color === 'string',
        )
      : [];
    return {
      name: String(saved.name).slice(0, 30),
      score: Math.max(0, Math.min(100, Math.round(Number(saved.score)))),
      categories,
      entryId: typeof saved.entryId === 'string' ? saved.entryId : null,
      at: typeof saved.at === 'string' ? saved.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function verdictFor(score: number): [string, string] {
  if (score >= 85)
    return [
      'Near-total approval',
      "Your instincts line up with Adel's worldview across almost every major area.",
    ];
  if (score >= 70)
    return [
      'Strong approval',
      'You share most of the core instincts, with a few clear limits of your own.',
    ];
  if (score >= 55)
    return [
      'Leaning positive',
      'There is enough overlap for real approval, but also enough disagreement for regular arguments.',
    ];
  if (score >= 45)
    return [
      'Almost evenly split',
      'You would likely respect some parts and reject others just as strongly.',
    ];
  if (score >= 30)
    return [
      'Mostly disapproval',
      'Your instincts clash with the core outlook more often than they match it.',
    ];
  return [
    'Very low approval',
    'You approach people, emotion, freedom, and relationships from a very different place.',
  ];
}

function calculateScores(): { overall: number; categories: CategoryScore[] } {
  const categoryMap = new Map<
    string,
    { sum: number; count: number; color: string }
  >();
  let total = 0;
  questions.forEach((q, i) => {
    const answer = answers[i];
    if (answer == null) return;
    const score = q.options[answer]![1];
    total += score;
    if (!categoryMap.has(q.category)) {
      categoryMap.set(q.category, { sum: 0, count: 0, color: q.color });
    }
    const item = categoryMap.get(q.category)!;
    item.sum += score;
    item.count++;
  });
  const categories = [...categoryMap.entries()].map(([name, item]) => ({
    name,
    color: item.color,
    score: Math.round((item.sum / (item.count * 4)) * 100),
  }));
  return {
    overall: Math.round((total / (totalQuestions * 4)) * 100),
    categories,
  };
}

function categoriesFromEntry(entry: LeaderboardEntry): CategoryScore[] {
  const scores = entry.categoryScores || {};
  const ordered = Object.keys(CATEGORY_COLORS).filter((name) => name in scores);
  const extras = Object.keys(scores).filter(
    (name) => !(name in CATEGORY_COLORS),
  );
  return [...ordered, ...extras].map((name) => ({
    name,
    score: scores[name]!,
    color: CATEGORY_COLORS[name] || '#a794ff',
  }));
}

async function fetchSnapshot(): Promise<PollSnapshot> {
  const res = await fetch(apiBase, {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`poll_status_${res.status}`);
  const data = (await res.json()) as PollSnapshot;
  return {
    alreadySubmitted: Boolean(data.alreadySubmitted),
    me: data.me ?? null,
    leaderboard: Array.isArray(data.leaderboard) ? data.leaderboard : [],
  };
}

async function submitScore(
  overall: number,
  categories: CategoryScore[],
): Promise<{ entry: LeaderboardEntry; leaderboard: LeaderboardEntry[] }> {
  if (answers.some((a) => a == null)) {
    throw new Error('incomplete_answers');
  }
  const res = await fetch(apiBase, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: playerName,
      score: overall,
      categories,
      answers: answers as number[],
      website: '',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    entry?: LeaderboardEntry;
    leaderboard?: LeaderboardEntry[];
  };
  if (res.status === 409 && data.entry) {
    return {
      entry: data.entry,
      leaderboard: Array.isArray(data.leaderboard)
        ? data.leaderboard
        : leaderboard,
    };
  }
  if (!res.ok || !data.entry) {
    const err = new Error(data.error || `poll_submit_${res.status}`);
    throw err;
  }
  return {
    entry: data.entry,
    leaderboard: Array.isArray(data.leaderboard)
      ? data.leaderboard
      : leaderboard,
  };
}

function renderLeaderboard(mount: HTMLElement, highlightName: string): void {
  const board = [...leaderboard].sort(
    (a, b) => b.score - a.score || +new Date(a.at) - +new Date(b.at),
  );
  if (!board.length) {
    mount.innerHTML = '<div class="empty-board">No scores yet.</div>';
    return;
  }
  mount.innerHTML = board
    .map((item, i) => {
      const flag = flagEmoji(item.countryCode);
      const isMe =
        (myEntryId && item.id === myEntryId) ||
        String(item.name).toLocaleLowerCase() ===
          highlightName.toLocaleLowerCase();
      const medal = RANK_MEDALS[i];
      const rankClass = i < 3 ? ` top-${i + 1}` : '';
      const rankLabel = medal
        ? `<span class="rank-medal" aria-label="Rank ${i + 1}">${medal}</span>`
        : `<span class="rank">#${i + 1}</span>`;
      return `<div class="leader-row${isMe ? ' me' : ''}${rankClass}">${rankLabel}<span class="leader-flag" title="${esc(item.countryCode || 'Somewhere cool')}">${flag || '🌍'}</span><span class="leader-name">${esc(item.name)}</span><span class="leader-score">${Number(item.score)}%</span></div>`;
    })
    .join('');
}

function showResultsUI(opts: {
  overall: number;
  categories: CategoryScore[];
  name: string;
  note?: string;
}): void {
  const nameGate = document.getElementById('nameGate');
  const quizApp = document.getElementById('quizApp');
  const results = document.getElementById('results');
  if (!results) return;

  const [verdict, copy] = verdictFor(opts.overall);
  const sorted = [...opts.categories].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  document.getElementById('scoreNumber')!.textContent = String(opts.overall);
  document
    .getElementById('scoreRing')!
    .style.setProperty('--score', String(opts.overall));
  document.getElementById('resultName')!.textContent = opts.name;
  document.getElementById('verdict')!.textContent = verdict;
  document.getElementById('verdictCopy')!.textContent = copy;
  document.getElementById('strongest')!.textContent = best
    ? `${best.name} · ${best.score}%`
    : '—';
  document.getElementById('weakest')!.textContent = worst
    ? `${worst.name} · ${worst.score}%`
    : '—';

  const noteEl = document.getElementById('leaderNote');
  if (noteEl) {
    noteEl.textContent =
      opts.note ||
      'Live board · one attempt each · flags show where people played from';
  }

  saveResultSnapshot({
    name: opts.name,
    score: opts.overall,
    categories: opts.categories,
    entryId: myEntryId,
  });

  const mount = document.getElementById('breakdownMount')!;
  mount.innerHTML = opts.categories
    .map((category) => {
      const icon = CATEGORY_ICONS[category.name] || '✨';
      return `<div class="section-result"><div class="section-result-head"><span><span aria-hidden="true">${icon}</span>${esc(category.name)}</span><span>${category.score}%</span></div><div class="bar" style="--bar-color:${category.color}"><i data-width="${category.score}%"></i></div></div>`;
    })
    .join('');

  nameGate?.classList.add('hidden');
  quizApp?.classList.add('hidden');
  results.classList.remove('hidden');
  renderLeaderboard(document.getElementById('leaderboardMount')!, opts.name);
  requestAnimationFrame(() =>
    mount.querySelectorAll<HTMLElement>('.bar i').forEach((bar) => {
      bar.style.width = bar.dataset.width || '0%';
    }),
  );
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderQuestion(): void {
  const questionCard = document.getElementById('questionCard')!;
  const questionMount = document.getElementById('questionMount')!;
  const prevBtn = document.getElementById('prevBtn') as HTMLButtonElement;
  const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
  const progressText = document.getElementById('progressText')!;
  const progressFill = document.getElementById('progressFill')!;
  const playerLabel = document.getElementById('playerLabel')!;

  const q = questions[currentQuestion]!;
  questionCard.style.setProperty('--question-color', q.color);
  const icon = CATEGORY_ICONS[q.category] || '✨';
  const letters = ['A', 'B', 'C', 'D'];
  const options = q.options
    .map(
      (option, index) =>
        `<div class="option"><input type="radio" id="option-${index}" name="answer" value="${index}" ${answers[currentQuestion] === index ? 'checked' : ''}><label for="option-${index}"><span class="option-letter" aria-hidden="true">${letters[index] ?? index + 1}</span>${esc(option[0])}</label></div>`,
    )
    .join('');
  questionMount.innerHTML = `<span class="category-pill"><span class="cat-icon" aria-hidden="true">${icon}</span>${esc(q.category)} · ${currentQuestion + 1}/${totalQuestions}</span><h2>${esc(q.prompt)}</h2><div class="options" role="radiogroup" aria-label="Answer choices">${options}</div>`;
  questionMount
    .querySelectorAll<HTMLInputElement>('input[name="answer"]')
    .forEach((input) =>
      input.addEventListener('change', (event) => {
        answers[currentQuestion] = Number(
          (event.target as HTMLInputElement).value,
        );
        nextBtn.disabled = false;
        saveState();
      }),
    );
  prevBtn.disabled = currentQuestion === 0;
  nextBtn.disabled = answers[currentQuestion] === null || submitting;
  nextBtn.textContent =
    currentQuestion === totalQuestions - 1 ? '🏁 See my score' : 'Next →';
  progressText.textContent = `${currentQuestion + 1} / ${totalQuestions}`;
  progressFill.style.width = `${Math.round(((currentQuestion + 1) / totalQuestions) * 100)}%`;
  playerLabel.textContent = playerName;
}

async function showResults(): Promise<void> {
  if (submitting) return;
  const { overall, categories } = calculateScores();
  submitting = true;
  const nextBtn = document.getElementById(
    'nextBtn',
  ) as HTMLButtonElement | null;
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = 'Saving…';
  }
  try {
    const { entry, leaderboard: board } = await submitScore(
      overall,
      categories,
    );
    leaderboard = board;
    myEntryId = entry.id;
    playerName = entry.name;
    clearState();
    showResultsUI({
      overall: entry.score,
      categories:
        categories.length > 0 ? categories : categoriesFromEntry(entry),
      name: entry.name,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message === 'already_submitted'
        ? 'Looks like you already played — your score is on the board.'
        : err instanceof Error && err.message === 'invalid_client'
          ? 'Could not save right now. Try again in a moment.'
          : 'Could not save your score. Check your connection and try again.';
    const status = document.getElementById('submitError');
    if (status) status.textContent = message;
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.textContent = '🏁 See my score';
    }
  } finally {
    submitting = false;
  }
}

function startQuiz(): void {
  document.getElementById('nameGate')?.classList.add('hidden');
  document.getElementById('quizApp')?.classList.remove('hidden');
  document.getElementById('results')?.classList.add('hidden');
  const playerLabel = document.getElementById('playerLabel');
  if (playerLabel) playerLabel.textContent = playerName;
  saveState();
  renderQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const LIVE_DISMISS_KEY = 'adelPollLiveOverlayDismissedRev';

/**
 * Temporary one-shot flash on /poll. Flip `enabled` to false (or delete) when done.
 * Does not touch quiz state — overlay only.
 */
const TEMP_PAGE_FLASH = {
  enabled: false,
  imageUrl: '/poll-live/colgate-flash.png',
  durationMs: 3000,
  sessionKey: 'adelPollTempFlashV1',
};

function bootTempPageFlash(): void {
  if (!TEMP_PAGE_FLASH.enabled) return;
  const root = document.getElementById('liveOverlay');
  const img = document.getElementById(
    'liveOverlayImage',
  ) as HTMLImageElement | null;
  const caption = document.getElementById('liveOverlayCaption');
  const closeBtn = document.getElementById('liveOverlayClose');
  if (!root || !img) return;

  try {
    if (sessionStorage.getItem(TEMP_PAGE_FLASH.sessionKey) === '1') return;
  } catch {
    /* ignore */
  }

  const hide = () => {
    root.classList.add('hidden');
    root.hidden = true;
    try {
      sessionStorage.setItem(TEMP_PAGE_FLASH.sessionKey, '1');
    } catch {
      /* ignore */
    }
  };

  img.src = TEMP_PAGE_FLASH.imageUrl;
  img.alt = '';
  if (caption) {
    caption.hidden = true;
    caption.textContent = '';
  }
  root.hidden = false;
  root.classList.remove('hidden');

  const timer = window.setTimeout(hide, TEMP_PAGE_FLASH.durationMs);
  closeBtn?.addEventListener(
    'click',
    () => {
      window.clearTimeout(timer);
      hide();
    },
    { once: true },
  );
}

function bootLiveOverlayPoller(pollEndpoint: string): void {
  const overlayUrl = pollEndpoint.replace(
    /\/adel-approval-v2\/?$/,
    '/live-overlay',
  );
  if (overlayUrl === pollEndpoint) return;

  const root = document.getElementById('liveOverlay');
  const img = document.getElementById(
    'liveOverlayImage',
  ) as HTMLImageElement | null;
  const caption = document.getElementById('liveOverlayCaption');
  const closeBtn = document.getElementById('liveOverlayClose');
  if (!root || !img) return;

  let shownRevision = '';

  const hide = () => {
    root.classList.add('hidden');
    root.hidden = true;
  };

  const show = (opts: {
    imageUrl: string;
    caption: string;
    revision: string;
  }) => {
    if (shownRevision === opts.revision) return;
    try {
      if (sessionStorage.getItem(LIVE_DISMISS_KEY) === opts.revision) return;
    } catch {
      /* ignore */
    }
    shownRevision = opts.revision;
    img.src = opts.imageUrl;
    img.alt = opts.caption || 'Live update';
    if (caption) {
      if (opts.caption) {
        caption.hidden = false;
        caption.textContent = opts.caption;
      } else {
        caption.hidden = true;
        caption.textContent = '';
      }
    }
    root.hidden = false;
    root.classList.remove('hidden');
  };

  closeBtn?.addEventListener('click', () => {
    try {
      if (shownRevision)
        sessionStorage.setItem(LIVE_DISMISS_KEY, shownRevision);
    } catch {
      /* ignore */
    }
    hide();
  });

  const tick = async () => {
    try {
      const res = await fetch(overlayUrl, {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        active?: boolean;
        overlay?: {
          imageUrl?: string;
          caption?: string;
          revision?: string;
        } | null;
      };
      if (!data.active || !data.overlay?.imageUrl || !data.overlay.revision) {
        hide();
        shownRevision = '';
        return;
      }
      show({
        imageUrl: data.overlay.imageUrl,
        caption: data.overlay.caption || '',
        revision: data.overlay.revision,
      });
    } catch {
      /* ignore transient errors */
    }
  };

  void tick();
  window.setInterval(() => {
    void tick();
  }, 4000);
}

function compatibilityVerdict(score: number): [string, string] {
  if (score >= 85)
    return [
      'Nearly the same wavelength',
      'These two line up on almost every major instinct.',
    ];
  if (score >= 70)
    return [
      'Strong compatibility',
      'Plenty of shared ground, with a few clear differences to argue about.',
    ];
  if (score >= 55)
    return [
      'Mixed compatibility',
      'Enough overlap to click, and enough clash to keep things spicy.',
    ];
  if (score >= 40)
    return [
      'Uneven match',
      'They would respect some instincts and reject others just as hard.',
    ];
  return [
    'Very different wiring',
    'These profiles pull in opposite directions more often than they meet.',
  ];
}

function setActiveTab(tab: 'poll' | 'compare'): void {
  activeTab = tab;
  const tabPoll = document.getElementById('tabPoll');
  const tabCompare = document.getElementById('tabCompare');
  const panelPoll = document.getElementById('panelPoll');
  const panelCompare = document.getElementById('panelCompare');
  const onPoll = tab === 'poll';
  tabPoll?.setAttribute('aria-selected', onPoll ? 'true' : 'false');
  tabCompare?.setAttribute('aria-selected', onPoll ? 'false' : 'true');
  if (panelPoll) {
    panelPoll.classList.toggle('hidden', !onPoll);
    panelPoll.hidden = !onPoll;
  }
  if (panelCompare) {
    panelCompare.classList.toggle('hidden', onPoll);
    panelCompare.hidden = onPoll;
  }
  if (!onPoll) {
    void refreshComparePanel();
  }
}

function populateCompareSelects(): void {
  const selectA = document.getElementById(
    'compareA',
  ) as HTMLSelectElement | null;
  const selectB = document.getElementById(
    'compareB',
  ) as HTMLSelectElement | null;
  if (!selectA || !selectB) return;
  const prevA = selectA.value;
  const prevB = selectB.value;
  const options = leaderboard
    .map((entry) => {
      const flag = flagEmoji(entry.countryCode) || '🌍';
      return `<option value="${esc(entry.id)}">${flag} ${esc(entry.name)} · ${entry.score}%</option>`;
    })
    .join('');
  selectA.innerHTML = options;
  selectB.innerHTML = options;
  if (leaderboard.length >= 2) {
    const defaultA =
      leaderboard.find((e) => e.id === prevA)?.id ||
      leaderboard.find((e) => e.id === myEntryId)?.id ||
      leaderboard[0]!.id;
    const defaultB =
      leaderboard.find((e) => e.id === prevB && e.id !== defaultA)?.id ||
      leaderboard.find((e) => e.id !== defaultA)?.id ||
      leaderboard[1]!.id;
    selectA.value = defaultA;
    selectB.value = defaultB;
  }
}

function renderCompare(): void {
  const mount = document.getElementById('compareMount');
  const selectA = document.getElementById(
    'compareA',
  ) as HTMLSelectElement | null;
  const selectB = document.getElementById(
    'compareB',
  ) as HTMLSelectElement | null;
  if (!mount || !selectA || !selectB) return;

  if (leaderboard.length < 2) {
    mount.innerHTML =
      '<div class="empty-board">Need at least two scores on the board.</div>';
    return;
  }

  const a = leaderboard.find((e) => e.id === selectA.value);
  const b = leaderboard.find((e) => e.id === selectB.value);
  if (!a || !b) {
    mount.innerHTML =
      '<div class="empty-board">Pick two people to compare.</div>';
    return;
  }
  if (a.id === b.id) {
    mount.innerHTML =
      '<div class="empty-board">Pick two different people.</div>';
    return;
  }

  const names = Object.keys(CATEGORY_COLORS);
  const topics = names
    .map((name) => {
      const left = a.categoryScores[name];
      const right = b.categoryScores[name];
      if (typeof left !== 'number' || typeof right !== 'number') return null;
      return {
        name,
        color: CATEGORY_COLORS[name] || '#a794ff',
        icon: CATEGORY_ICONS[name] || '✨',
        left,
        right,
        gap: Math.abs(left - right),
      };
    })
    .filter(Boolean) as Array<{
    name: string;
    color: string;
    icon: string;
    left: number;
    right: number;
    gap: number;
  }>;

  if (!topics.length) {
    mount.innerHTML =
      '<div class="empty-board">No topic scores available for that pair.</div>';
    return;
  }

  const avgGap =
    topics.reduce((sum, topic) => sum + topic.gap, 0) / topics.length;
  const compatibility = Math.round(100 - avgGap);
  const [headline, copy] = compatibilityVerdict(compatibility);
  const sorted = [...topics].sort((x, y) => x.gap - y.gap);
  const closest = sorted[0]!;
  const furthest = sorted[sorted.length - 1]!;
  const flagA = flagEmoji(a.countryCode) || '🌍';
  const flagB = flagEmoji(b.countryCode) || '🌍';

  mount.innerHTML = `
    <div class="compare-score-row">
      <div class="compare-ring" style="--score:${compatibility}">
        <div class="compare-ring-inside">
          <b>${compatibility}</b>
          <span>match</span>
        </div>
      </div>
      <div>
        <h3 class="compare-headline">${esc(headline)}</h3>
        <p class="compare-copy">${esc(copy)}</p>
        <div class="compare-meta">
          <span class="compare-chip">${flagA} ${esc(a.name)} · ${a.score}%</span>
          <span class="compare-chip">${flagB} ${esc(b.name)} · ${b.score}%</span>
        </div>
        <div class="compare-meta">
          <span class="compare-chip">💞 Closest · ${esc(closest.name)} (${closest.gap}pt gap)</span>
          <span class="compare-chip">⚡ Biggest gap · ${esc(furthest.name)} (${furthest.gap}pt)</span>
        </div>
      </div>
    </div>
    <div class="compare-topics">
      ${topics
        .map(
          (topic) => `
        <div class="compare-topic">
          <div class="compare-topic-head">
            <span>${topic.icon} ${esc(topic.name)}</span>
            <em>${topic.gap}pt apart</em>
          </div>
          <div class="compare-dual">
            <div class="compare-dual-row">
              <span>${esc(a.name)}</span>
              <div class="compare-dual-track"><i style="width:${topic.left}%;background:${topic.color}"></i></div>
              <span>${topic.left}%</span>
            </div>
            <div class="compare-dual-row">
              <span>${esc(b.name)}</span>
              <div class="compare-dual-track"><i style="width:${topic.right}%;background:${topic.color};opacity:.72"></i></div>
              <span>${topic.right}%</span>
            </div>
          </div>
        </div>`,
        )
        .join('')}
    </div>
  `;
}

async function refreshComparePanel(): Promise<void> {
  try {
    const snapshot = await fetchSnapshot();
    leaderboard = snapshot.leaderboard;
  } catch {
    /* keep existing board */
  }
  populateCompareSelects();
  renderCompare();
}

export async function bootAdelApprovalPoll(endpoint: string): Promise<void> {
  apiBase = endpoint;
  bootTempPageFlash();
  bootLiveOverlayPoller(endpoint);

  const nameGate = document.getElementById('nameGate');
  const quizApp = document.getElementById('quizApp');
  const results = document.getElementById('results');
  const nameForm = document.getElementById('nameForm');
  const nameInput = document.getElementById(
    'nameInput',
  ) as HTMLInputElement | null;
  const nameError = document.getElementById('nameError');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const copyBtn = document.getElementById('copyBtn');
  const gateStatus = document.getElementById('gateStatus');
  const tabPoll = document.getElementById('tabPoll');
  const tabCompare = document.getElementById('tabCompare');
  const compareA = document.getElementById('compareA');
  const compareB = document.getElementById('compareB');

  let restoredResults = false;

  try {
    const snapshot = await fetchSnapshot();
    leaderboard = snapshot.leaderboard;
    if (snapshot.alreadySubmitted && snapshot.me) {
      myEntryId = snapshot.me.id;
      playerName = snapshot.me.name;
      clearState();
      showResultsUI({
        overall: snapshot.me.score,
        categories: categoriesFromEntry(snapshot.me),
        name: snapshot.me.name,
        note: 'You already played — here’s your spot on the board.',
      });
      restoredResults = true;
    }
  } catch {
    if (gateStatus) {
      gateStatus.textContent =
        'Board is warming up — you can still play, saving might lag for a bit.';
    }
  }

  if (!restoredResults) {
    const saved = loadResultSnapshot();
    if (saved) {
      myEntryId = saved.entryId;
      playerName = saved.name;
      clearState();
      showResultsUI({
        overall: saved.score,
        categories:
          saved.categories.length > 0
            ? saved.categories
            : categoriesFromEntry({
                id: saved.entryId || '',
                name: saved.name,
                score: saved.score,
                countryCode: '',
                categoryScores: {},
                at: saved.at,
              }),
        name: saved.name,
        note: 'Welcome back — here’s your saved result on this browser.',
      });
      restoredResults = true;
    }
  }

  tabPoll?.addEventListener('click', () => setActiveTab('poll'));
  tabCompare?.addEventListener('click', () => setActiveTab('compare'));
  compareA?.addEventListener('change', () => renderCompare());
  compareB?.addEventListener('change', () => renderCompare());
  populateCompareSelects();

  nameForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!nameInput || !nameError) return;
    if (loadResultSnapshot() || myEntryId) {
      nameError.textContent =
        'You already have a result on this browser. Open it from your saved score.';
      const saved = loadResultSnapshot();
      if (saved) {
        showResultsUI({
          overall: saved.score,
          categories: saved.categories,
          name: saved.name,
          note: 'You already played — here’s your saved result.',
        });
      }
      return;
    }
    const value = nameInput.value.trim().replace(/\s+/g, ' ');
    if (!value) {
      nameError.textContent = 'Put a name in first.';
      nameInput.focus();
      return;
    }
    playerName = value.slice(0, 30);
    nameError.textContent = '';
    startQuiz();
  });

  prevBtn?.addEventListener('click', () => {
    if (currentQuestion > 0) {
      currentQuestion--;
      saveState();
      renderQuestion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (answers[currentQuestion] === null) return;
    if (currentQuestion < totalQuestions - 1) {
      currentQuestion++;
      saveState();
      renderQuestion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      void showResults();
    }
  });

  copyBtn?.addEventListener('click', async (event) => {
    const saved = loadResultSnapshot();
    const score =
      saved?.score ??
      (myEntryId != null
        ? (leaderboard.find((e) => e.id === myEntryId)?.score ??
          calculateScores().overall)
        : calculateScores().overall);
    const name = saved?.name || playerName;
    const [verdict] = verdictFor(score);
    const text = `${name} scored ${score}% on the Adel Approval Poll — ${verdict}`;
    const target = event.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(text);
      target.textContent = 'Copied';
      setTimeout(() => {
        target.textContent = '📋 Copy score';
      }, 1300);
    } catch {
      window.prompt('Copy:', text);
    }
  });

  if (!restoredResults) {
    if (loadState()) {
      nameGate?.classList.add('hidden');
      quizApp?.classList.remove('hidden');
      results?.classList.add('hidden');
      renderQuestion();
    } else {
      nameInput?.focus();
    }
  }
}
