import {
  steerQueueStateSchema,
  type SteerQueueItem,
  type SteerQueueState,
  type SteerQueueStatus,
  type SteerQueueTarget,
} from "../agent/types";

export const STEER_QUEUE_STORAGE_KEY = "steerQueueState";

type QueueStorage = Pick<DurableObjectStorage, "get" | "put">;

type EnqueueSteerItemsArgs = {
  target: SteerQueueTarget;
  texts: string[];
  now?: number;
};

export function createInitialSteerQueueState(now = Date.now()): SteerQueueState {
  return {
    liveSteerQueue: [],
    postFinishQueue: [],
    isRunActive: false,
    isLiveFlushing: false,
    isPostFlushing: false,
    activeRunId: null,
    version: now,
  };
}

export async function readSteerQueueState(
  storage: QueueStorage,
  fallback?: SteerQueueState | null,
): Promise<SteerQueueState> {
  const stored = await storage.get<unknown>(STEER_QUEUE_STORAGE_KEY);
  if (stored != null) {
    return normalizeSteerQueueState(stored);
  }
  if (fallback != null) {
    return normalizeSteerQueueState(fallback);
  }
  return createInitialSteerQueueState();
}

export async function writeSteerQueueState(
  storage: QueueStorage,
  state: SteerQueueState,
): Promise<void> {
  await storage.put(STEER_QUEUE_STORAGE_KEY, normalizeSteerQueueState(state));
}

export function normalizeSteerQueueState(value: unknown): SteerQueueState {
  const parsed = steerQueueStateSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  if (value && typeof value === "object") {
    const legacy = value as {
      live?: unknown[];
      postFinish?: unknown[];
      updatedAt?: number;
      liveSteerQueue?: unknown[];
      postFinishQueue?: unknown[];
      isRunActive?: boolean;
      isLiveFlushing?: boolean;
      isPostFlushing?: boolean;
      activeRunId?: string | null;
      version?: number;
    };
    const liveRaw = Array.isArray(legacy.liveSteerQueue)
      ? legacy.liveSteerQueue
      : Array.isArray(legacy.live)
        ? legacy.live
        : [];
    const postRaw = Array.isArray(legacy.postFinishQueue)
      ? legacy.postFinishQueue
      : Array.isArray(legacy.postFinish)
        ? legacy.postFinish
        : [];

    return {
      liveSteerQueue: normalizeItems(liveRaw, "live"),
      postFinishQueue: normalizeItems(postRaw, "post_finish"),
      isRunActive: Boolean(legacy.isRunActive),
      isLiveFlushing: Boolean(legacy.isLiveFlushing),
      isPostFlushing: Boolean(legacy.isPostFlushing),
      activeRunId: typeof legacy.activeRunId === "string" ? legacy.activeRunId : null,
      version: typeof legacy.version === "number" ? legacy.version : legacy.updatedAt ?? Date.now(),
    };
  }

  return createInitialSteerQueueState();
}

export function enqueueSteerItems(
  state: SteerQueueState,
  args: EnqueueSteerItemsArgs,
): { state: SteerQueueState; items: SteerQueueItem[] } {
  const now = args.now ?? Date.now();
  const items = args.texts.map((text) => ({
    id: crypto.randomUUID(),
    text,
    source: args.target,
    status: "queued" as const,
    createdAt: now,
  }));
  if (items.length === 0) {
    return { state, items };
  }

  const nextState =
    args.target === "live"
      ? {
        ...state,
        liveSteerQueue: state.liveSteerQueue.concat(items),
        version: now,
      }
      : {
        ...state,
        postFinishQueue: state.postFinishQueue.concat(items),
        version: now,
      };
  return { state: nextState, items };
}

export function listQueuedLiveItems(state: SteerQueueState): SteerQueueItem[] {
  return state.liveSteerQueue.filter((item) => item.status === "queued");
}

export function markSteerItemStatus(
  state: SteerQueueState,
  itemId: string,
  status: SteerQueueStatus,
  options?: { error?: string; now?: number },
): SteerQueueState {
  const now = options?.now ?? Date.now();
  const mapItem = (item: SteerQueueItem): SteerQueueItem => {
    if (item.id !== itemId) return item;
    return {
      ...item,
      status,
      ...(status === "injecting" ? { startedAt: now } : {}),
      ...(status === "done" || status === "failed" ? { completedAt: now } : {}),
      ...(status === "failed" && options?.error ? { error: options.error } : {}),
    };
  };

  return {
    ...state,
    liveSteerQueue: state.liveSteerQueue.map(mapItem),
    postFinishQueue: state.postFinishQueue.map(mapItem),
    version: now,
  };
}

export function removeSteerItem(
  state: SteerQueueState,
  itemId: string,
  queue?: SteerQueueTarget,
  now = Date.now(),
): { state: SteerQueueState; removedFrom: SteerQueueTarget[] } {
  const removedFrom: SteerQueueTarget[] = [];
  const nextLive = queue === "post_finish"
    ? state.liveSteerQueue
    : state.liveSteerQueue.filter((item) => item.id !== itemId);
  if (nextLive.length !== state.liveSteerQueue.length) {
    removedFrom.push("live");
  }

  const nextPost = queue === "live"
    ? state.postFinishQueue
    : state.postFinishQueue.filter((item) => item.id !== itemId);
  if (nextPost.length !== state.postFinishQueue.length) {
    removedFrom.push("post_finish");
  }

  if (removedFrom.length === 0) {
    return { state, removedFrom };
  }

  return {
    state: {
      ...state,
      liveSteerQueue: nextLive,
      postFinishQueue: nextPost,
      version: now,
    },
    removedFrom,
  };
}

export function setRunFlags(
  state: SteerQueueState,
  updates: Partial<Pick<SteerQueueState, "isRunActive" | "isLiveFlushing" | "isPostFlushing" | "activeRunId">>,
  now = Date.now(),
): SteerQueueState {
  return {
    ...state,
    ...updates,
    version: now,
  };
}

export function getNextQueuedPostFinishItem(state: SteerQueueState): SteerQueueItem | null {
  return state.postFinishQueue.find((item) => item.status === "queued") ?? null;
}

export function recoverInterruptedSteerQueueState(
  state: SteerQueueState,
  now = Date.now(),
): SteerQueueState {
  const normalizeStatus = (item: SteerQueueItem): SteerQueueItem =>
    item.status === "injecting"
      ? {
        ...item,
        status: "queued",
        ...(item.error ? {} : { error: "Recovered after interrupted run" }),
      }
      : item;

  return {
    ...state,
    liveSteerQueue: state.liveSteerQueue.map(normalizeStatus),
    postFinishQueue: state.postFinishQueue.map(normalizeStatus),
    isRunActive: false,
    isLiveFlushing: false,
    isPostFlushing: false,
    activeRunId: null,
    version: now,
  };
}

function normalizeItems(input: unknown[], source: SteerQueueTarget): SteerQueueItem[] {
  return input.map((item, index) => normalizeItem(item, source, index)).filter((item): item is SteerQueueItem => item !== null);
}

function normalizeItem(input: unknown, source: SteerQueueTarget, index: number): SteerQueueItem | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as {
    id?: unknown;
    text?: unknown;
    directive?: unknown;
    source?: unknown;
    status?: unknown;
    createdAt?: unknown;
    error?: unknown;
    startedAt?: unknown;
    completedAt?: unknown;
  };
  const textCandidate = typeof raw.text === "string"
    ? raw.text
    : typeof raw.directive === "string"
      ? raw.directive
      : null;
  if (!textCandidate || textCandidate.trim().length === 0) return null;

  const normalizedSource = raw.source === "live" || raw.source === "post_finish"
    ? raw.source
    : source;
  const normalizedStatus = raw.status === "queued" || raw.status === "injecting" || raw.status === "done" || raw.status === "failed"
    ? raw.status
    : "queued";

  return {
    id: typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : `${normalizedSource}-${Date.now()}-${index}`,
    text: textCandidate.trim(),
    source: normalizedSource,
    status: normalizedStatus,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
    ...(typeof raw.startedAt === "number" ? { startedAt: raw.startedAt } : {}),
    ...(typeof raw.completedAt === "number" ? { completedAt: raw.completedAt } : {}),
  };
}
