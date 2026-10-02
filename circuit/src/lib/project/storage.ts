/**
 * Local project storage (localStorage). Every access is guarded: storage can be
 * unavailable (private mode, blocked site data) or full, and the editor must
 * keep working either way.
 */
import type { Program, WorkspaceState } from "@/lib/ir";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

/**
 * Birth-time configuration: how the project relates to a token. This is
 * separate from the runtime program; blocks can't change it.
 */
export interface ProjectSetup {
  launchMode: "prototype" | "existing" | "launch";
  /** Existing token. */
  tokenAddress: string;
  walletAddress: string;
  monitor: { trades: boolean; volume: boolean; wallet: boolean };
  /** SOL set aside (separately funded) for the program to spend. */
  executionBudget: number;
  /** Launch with Circuit (prototype only, nothing is launched). */
  tokenName: string;
  tokenSymbol: string;
}

export const DEFAULT_SETUP: ProjectSetup = {
  launchMode: "prototype",
  tokenAddress: "",
  walletAddress: "",
  monitor: { trades: true, volume: true, wallet: false },
  executionBudget: 1,
  tokenName: "",
  tokenSymbol: "",
};

/** Fills gaps in a stored setup (older projects have none). */
export const readSetup = (raw: unknown): ProjectSetup => {
  const r = (raw ?? {}) as Partial<ProjectSetup>;
  return { ...DEFAULT_SETUP, ...r, monitor: { ...DEFAULT_SETUP.monitor, ...(r.monitor ?? {}) } };
};

export interface ProjectRecord extends ProjectMeta {
  createdAt: number;
  /** Exact editor state (Blockly JSON) — what we restore from. */
  blockly: WorkspaceState;
  /** The same program as Circuit IR; null if conversion failed. */
  program: Program | null;
  setup?: ProjectSetup;
}

interface Index {
  projects: ProjectMeta[];
  currentId: string | null;
}

const INDEX_KEY = "circuit:index";
const projectKey = (id: string) => `circuit:project:${id}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false if storage is unavailable or full. */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to remove */
  }
}

export const readIndex = (): Index => read<Index>(INDEX_KEY) ?? { projects: [], currentId: null };

export const loadProject = (id: string) => read<ProjectRecord>(projectKey(id));

export function saveProject(record: ProjectRecord): boolean {
  if (!write(projectKey(record.id), record)) return false;
  const index = readIndex();
  const meta: ProjectMeta = { id: record.id, name: record.name, updatedAt: record.updatedAt };
  const others = index.projects.filter((p) => p.id !== record.id);
  return write(INDEX_KEY, { ...index, projects: [meta, ...others] });
}

export function setCurrentProject(id: string | null) {
  write(INDEX_KEY, { ...readIndex(), currentId: id });
}

export function deleteProject(id: string) {
  remove(projectKey(id));
  const index = readIndex();
  write(INDEX_KEY, {
    projects: index.projects.filter((p) => p.id !== id),
    currentId: index.currentId === id ? null : index.currentId,
  });
}

export const newProjectId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
