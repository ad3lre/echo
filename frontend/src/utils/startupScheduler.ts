type StartupPriority = 'critical' | 'high' | 'idle';

type StartupTask = {
  name: string;
  run: () => void | Promise<void>;
};

const criticalQueue: StartupTask[] = [];
const highQueue: StartupTask[] = [];
const idleQueue: StartupTask[] = [];
const seenTaskNames = new Set<string>();

/** Delay before draining queued startup tasks if the user never interacts first. */
const STARTUP_KICKOFF_DELAY_MS = 5000;

let highScheduled = false;
let idleScheduled = false;
let idleStarted = false;

function runTask(task: StartupTask): void {
  try {
    const result = task.run();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      void result;
    }
  } catch {
    // Intentionally swallow startup background task failures.
  }
}

function flushQueue(queue: StartupTask[]): void {
  while (queue.length > 0) {
    const task = queue.shift();
    if (!task) continue;
    runTask(task);
  }
}

function scheduleHighFlush(): void {
  if (highScheduled) return;
  highScheduled = true;

  const flush = () => {
    highScheduled = false;
    flushQueue(highQueue);
  };

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(flush);
    return;
  }
  setTimeout(flush, 0);
}

function startIdleExecution(): void {
  if (idleStarted) return;
  idleStarted = true;
  flushQueue(idleQueue);
}

function scheduleIdleStart(): void {
  if (idleScheduled || typeof window === 'undefined') return;
  idleScheduled = true;

  const kickoff = () => startIdleExecution();

  const onFirstInteraction = () => {
    window.removeEventListener('pointerdown', onFirstInteraction);
    window.removeEventListener('keydown', onFirstInteraction);
    window.removeEventListener('touchstart', onFirstInteraction);
    kickoff();
  };

  window.addEventListener('pointerdown', onFirstInteraction, {
    once: true,
    passive: true,
  });
  window.addEventListener('keydown', onFirstInteraction, { once: true });
  window.addEventListener('touchstart', onFirstInteraction, {
    once: true,
    passive: true,
  });

  setTimeout(kickoff, STARTUP_KICKOFF_DELAY_MS);
}

export function enqueueStartupTask(
  name: string,
  priority: StartupPriority,
  run: () => void | Promise<void>,
): void {
  if (!name.trim() || seenTaskNames.has(name)) return;
  seenTaskNames.add(name);
  const task: StartupTask = { name, run };

  if (priority === 'critical') {
    criticalQueue.push(task);
    flushQueue(criticalQueue);
    return;
  }

  if (priority === 'high') {
    highQueue.push(task);
    scheduleHighFlush();
    return;
  }

  idleQueue.push(task);
  scheduleIdleStart();
}
