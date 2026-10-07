/** Countdown timer: default 2:00, shows overtime after 0, never blocks answering. */

export type TimerTick = {
  /** Elapsed since start in ms (positive always). */
  elapsedMs: number;
  /** Remaining until zero; negative when overtime. */
  remainingMs: number;
  /** Display like "2:00", "0:05", or "+0:12" when overtime. */
  display: string;
  overtime: boolean;
};

export type TimerController = {
  start: () => void;
  stop: () => void;
  getState: () => TimerTick;
};

function formatMmSs(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const body = `${m}:${s.toString().padStart(2, "0")}`;
  return totalSeconds < 0 ? `+${body}` : body;
}

export function createTimer(
  durationMs: number,
  onTick: (tick: TimerTick) => void,
): TimerController {
  let startedAt: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const compute = (): TimerTick => {
    const elapsedMs = startedAt == null ? 0 : Date.now() - startedAt;
    const remainingMs = durationMs - elapsedMs;
    const overtime = remainingMs < 0;
    const display = formatMmSs(Math.ceil(remainingMs / 1000));
    return { elapsedMs, remainingMs, display, overtime };
  };

  const emit = () => onTick(compute());

  return {
    start() {
      if (intervalId != null) return;
      startedAt = Date.now();
      emit();
      intervalId = setInterval(emit, 250);
    },
    stop() {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    getState: compute,
  };
}

export const DEFAULT_DURATION_MS = 2 * 60 * 1000;
