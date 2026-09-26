// Coalesces the kingdom data refetches triggered by socket events.
//
// One long rest fires `dayAdvanced` (and every mutation echoes `kingdomDataChanged` to every open
// client, including the one that made the change), and each used to trigger its own full refetch of
// the kingdom list, the selected fief (~1 MB for a big fief) and the animals. This coordinator
// merges everything requested inside a short window into a single run, and never lets two runs
// overlap: requests that arrive mid-run are queued and served by one more run afterwards.

export interface RefreshTargets {
  kingdoms?: boolean;
  fief?: boolean;
  animals?: boolean;
}

export interface RefreshCoordinator {
  request: (targets: RefreshTargets) => void;
  cancel: () => void;
}

export const createRefreshCoordinator = (
  run: (targets: Required<RefreshTargets>) => Promise<void>,
  delayMs = 250
): RefreshCoordinator => {
  let pending: Required<RefreshTargets> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let cancelled = false;

  const schedule = () => {
    if (timer == null && !running) timer = setTimeout(flush, delayMs);
  };

  async function flush() {
    timer = null;
    if (cancelled || running || !pending) return;
    const targets = pending;
    pending = null;
    running = true;
    try {
      await run(targets);
    } catch {
      // The individual fetchers already surface their own errors.
    } finally {
      running = false;
      if (pending && !cancelled) schedule();
    }
  }

  return {
    request: (targets) => {
      cancelled = false;
      pending = {
        kingdoms: Boolean(pending?.kingdoms || targets.kingdoms),
        fief: Boolean(pending?.fief || targets.fief),
        animals: Boolean(pending?.animals || targets.animals),
      };
      schedule();
    },
    cancel: () => {
      cancelled = true;
      pending = null;
      if (timer != null) clearTimeout(timer);
      timer = null;
    },
  };
};
