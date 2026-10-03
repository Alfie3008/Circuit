import * as Blockly from "blockly/core";
import { create } from "zustand";
import { STARTER_PROGRAM } from "@/lib/blocks/starter";
import {
  blocklyToProgram,
  describeIssues,
  IrConversionError,
  parseProgram,
  plainIssues,
  programToBlockly,
  type Program,
  type WorkspaceState,
} from "@/lib/ir";
import { fileNameFor, readProjectFile, serializeProjectFile } from "@/lib/project/file";
import { deleteRuntime } from "@/lib/runtime/state";
import {
  DEFAULT_SETUP,
  deleteProject as removeStored,
  loadProject,
  readSetup,
  newProjectId,
  readIndex,
  saveProject,
  setCurrentProject,
  type ProjectMeta,
  type ProjectRecord,
  type ProjectSetup,
} from "@/lib/project/storage";
import { getTemplate } from "@/lib/templates";

export type SaveStatus = "saved" | "saving" | "error";

export interface Notice {
  id: number;
  kind: "info" | "error";
  text: string;
}

interface ProjectState {
  current: ProjectMeta | null;
  projects: ProjectMeta[];
  saveStatus: SaveStatus;
  /** Live Circuit IR of the workspace (null if it doesn't convert). */
  program: Program | null;
  irError: string | null;
  /** The block the first problem is in, to highlight on the canvas. */
  irBlockId: string | null;
  stats: { blocks: number; scripts: number };
  canUndo: boolean;
  canRedo: boolean;
  notice: Notice | null;
  setup: ProjectSetup;
  /** Block selected on the canvas (for the plain-English view). */
  selectedBlockId: string | null;
  /** Open dialog, if any. */
  dialog: "templates" | "setup" | "publish" | "golive" | null;

  attach: (ws: Blockly.WorkspaceSvg) => void;
  detach: () => void;
  /** Save pending edits immediately (e.g. before the page is hidden). */
  flush: () => void;
  workspaceChanged: (e: Blockly.Events.Abstract) => void;
  undo: (redo?: boolean) => void;
  newProject: () => void;
  /** New project from a template id, or blank when null. */
  newFromTemplate: (id: string | null) => void;
  updateSetup: (setup: Partial<ProjectSetup>) => void;
  /** Opens a Circuit IR program (e.g. from Build with AI) as a new project. */
  openProgram: (name: string, program: Program) => boolean;
  openDialog: (dialog: "templates" | "setup" | "publish" | "golive" | null) => void;
  openProject: (id: string) => void;
  duplicateProject: () => void;
  renameProject: (name: string) => void;
  resetProject: () => void;
  deleteProject: (id: string) => void;
  exportProject: () => void;
  importProject: (file: File) => Promise<void>;
  notify: (kind: Notice["kind"], text: string) => void;
  dismissNotice: () => void;
}

/** Stacks top-level blocks in one column with breathing room (for programs without positions). */
function layoutTopBlocks(workspace: Blockly.WorkspaceSvg) {
  let y = 48;
  for (const block of workspace.getTopBlocks(true)) {
    block.moveTo(new Blockly.utils.Coordinate(48, y));
    y += block.getHeightWidth().height + 56;
  }
}

// Editor session state that shouldn't trigger React renders.
let ws: Blockly.WorkspaceSvg | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSavedJson = "";
let createdAt = 0;
let noticeId = 0;

const AUTOSAVE_MS = 500;
const EMPTY: WorkspaceState = {};

/** Id of the top block of the selected stack (a script's hat), if any. */
export function selectedRootId(): string | null {
  const selected = ws ? Blockly.getSelected() : null;
  return selected instanceof Blockly.BlockSvg ? selected.getRootBlock().id : null;
}

/** Lights up a block on the canvas (running / failed), clearing the previous one. */
const MARK_CLASS = { active: "circuitActive", error: "circuitError", hover: "circuitHover" } as const;

/** Lights up a block on the canvas (running / failed / pointed at), clearing the previous one. */
export function markBlock(kind: keyof typeof MARK_CLASS, id: string | null | undefined) {
  if (!ws) return;
  const cls = MARK_CLASS[kind];
  for (const el of ws.getParentSvg().querySelectorAll(`.${cls}`)) el.classList.remove(cls);
  const block = id ? ws.getBlockById(id) : null;
  block?.getSvgRoot().classList.add(cls);
}

export const useProjectStore = create<ProjectState>((set, get) => {
  /** Blockly JSON + IR for the current workspace. */
  const snapshot = () => {
    const blockly = Blockly.serialization.workspaces.save(ws!) as WorkspaceState;
    try {
      const ir = blocklyToProgram(blockly);
      const parsed = parseProgram(ir);
      return parsed.ok
        ? { blockly, program: parsed.program, irError: null, irBlockId: null }
        : { blockly, program: null, irError: plainIssues(ir, parsed.issues), irBlockId: describeIssues(ir, parsed.issues).find((d) => d.blockId)?.blockId ?? null };
    } catch (e) {
      const irError =
        e instanceof IrConversionError
          ? `${e.message.replace(/^Unknown block type "(.*)"$/, 'The canvas has a block Circuit doesn\'t know ("$1"). Delete it to continue.')}`
          : `The blocks couldn't be read (${(e as Error).message}). Undo the last change, or delete the block you just added.`;
      return { blockly, program: null, irError, irBlockId: null };
    }
  };

  const refresh = () => {
    if (!ws) return;
    const { program, irError, irBlockId } = snapshot();
    set({
      program,
      irError,
      irBlockId,
      canUndo: ws.getUndoStack().length > 0,
      canRedo: ws.getRedoStack().length > 0,
      stats: {
        blocks: ws.getAllBlocks(false).filter((b) => !b.isShadow()).length,
        scripts: program?.scripts.length ?? 0,
      },
    });
  };

  /** Writes the current workspace to storage now (skips if unchanged). */
  const saveNow = () => {
    clearTimeout(saveTimer);
    const { current } = get();
    if (!ws || !current) return;
    const { blockly, program } = snapshot();
    const json = JSON.stringify(blockly);
    if (json === lastSavedJson) return set({ saveStatus: "saved" });
    const meta = { ...current, updatedAt: Date.now() };
    const record: ProjectRecord = { ...meta, createdAt, blockly, program, setup: get().setup };
    if (saveProject(record)) {
      lastSavedJson = json;
      set({ current: meta, projects: readIndex().projects, saveStatus: "saved" });
    } else {
      set({ saveStatus: "error" });
    }
  };

  /** Replaces the canvas without recording undo history. Throws on invalid state. */
  const loadInto = (state: WorkspaceState, needsLayout = false) => {
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(state as object, ws!);
    } finally {
      Blockly.Events.enable();
    }
    if (needsLayout) layoutTopBlocks(ws!);
    ws!.clearUndo();
    ws!.scroll(0, 0);
    lastSavedJson = JSON.stringify(Blockly.serialization.workspaces.save(ws!));
    refresh();
  };

  /**
   * Creates, stores and opens a new project from Blockly state. All or nothing:
   * if the blocks can't be loaded, the canvas goes back to what it was and this
   * throws, so a half-built canvas is never saved over the previous project.
   */
  const startProject = (name: string, state: WorkspaceState, needsLayout = false, setup: ProjectSetup = DEFAULT_SETUP) => {
    saveNow();
    const previous = ws ? Blockly.serialization.workspaces.save(ws) : null;
    try {
      loadInto(state, needsLayout);
    } catch (e) {
      if (previous) {
        try {
          loadInto(previous as WorkspaceState);
        } catch {
          // The previous canvas was valid a moment ago; if even that fails, the stored copy is still intact.
        }
      }
      throw e;
    }
    set({ setup });
    const now = Date.now();
    createdAt = now;
    const meta: ProjectMeta = { id: newProjectId(), name, updatedAt: now };
    set({ current: meta });
    setCurrentProject(meta.id);
    lastSavedJson = ""; // force the first write
    saveNow();
  };

  /** "base", or "base 2", "base 3"… if taken. */
  const uniqueName = (base: string) => {
    const names = new Set(get().projects.map((p) => p.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  };
  const untitled = () => uniqueName("Untitled project");

  const openRecord = (record: ProjectRecord): boolean => {
    try {
      loadInto(record.blockly);
    } catch {
      // Editor state unreadable — fall back to the IR copy.
      try {
        if (!record.program) throw new Error();
        const { state, needsLayout } = programToBlockly(record.program);
        loadInto(state, needsLayout);
      } catch {
        return false;
      }
    }
    createdAt = record.createdAt;
    const meta: ProjectMeta = { id: record.id, name: record.name, updatedAt: record.updatedAt };
    set({ current: meta, saveStatus: "saved", setup: readSetup(record.setup) });
    setCurrentProject(record.id);
    return true;
  };

  return {
    current: null,
    projects: [],
    saveStatus: "saved",
    program: null,
    irError: null,
    irBlockId: null,
    stats: { blocks: 0, scripts: 0 },
    canUndo: false,
    canRedo: false,
    notice: null,
    setup: DEFAULT_SETUP,
    selectedBlockId: null,
    dialog: null,

    attach: (workspace) => {
      ws = workspace;
      const index = readIndex();
      set({ projects: index.projects });
      const record = index.currentId ? loadProject(index.currentId) : null;
      if (record && openRecord(record)) return;
      if (record) get().notify("error", `Couldn't open "${record.name}". It was kept; starting a new project.`);
      startProject(index.projects.length ? untitled() : "My first circuit", index.projects.length ? EMPTY : (STARTER_PROGRAM as WorkspaceState));
    },

    detach: () => {
      saveNow();
      ws = null;
    },

    flush: () => saveNow(),

    workspaceChanged: (e) => {
      if (e.isUiEvent || !ws) return;
      refresh();
      set({ saveStatus: "saving" });
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, AUTOSAVE_MS);
    },

    undo: (redo = false) => {
      ws?.undo(redo);
    },

    newProject: () => startProject(untitled(), EMPTY),

    newFromTemplate: (id) => {
      const template = id ? getTemplate(id) : undefined;
      set({ dialog: null });
      try {
        if (!template) return startProject(untitled(), EMPTY);
        const { state, needsLayout } = programToBlockly(template.program);
        startProject(uniqueName(template.name), state, needsLayout);
        get().notify("info", `${template.name}: ${template.tryIt}`);
      } catch (e) {
        console.error("[circuit] template failed to open", e);
        get().notify("error", "That template couldn't be opened. Your current project is unchanged.");
      }
    },

    openProgram: (name, program) => {
      try {
        const { state, needsLayout } = programToBlockly(program);
        startProject(uniqueName(name), state, needsLayout);
        return true;
      } catch (e) {
        console.error("[circuit] program failed to open", e);
        get().notify("error", "Those blocks couldn't be put on the canvas. Your current project is unchanged; try again or describe it differently.");
        return false;
      }
    },

    updateSetup: (patch) => {
      const setup = { ...get().setup, ...patch, monitor: { ...get().setup.monitor, ...(patch.monitor ?? {}) } };
      set({ setup });
      lastSavedJson = ""; // setup changed even though blocks didn't
      saveNow();
    },

    openDialog: (dialog) => set({ dialog }),

    openProject: (id) => {
      const previous = get().current;
      if (id === previous?.id) return;
      saveNow();
      const record = loadProject(id);
      if (record && openRecord(record)) return;
      // Restore the project we came from so a half-loaded canvas is never autosaved over it.
      const back = previous && loadProject(previous.id);
      if (back) openRecord(back);
      get().notify("error", "That project couldn't be opened.");
    },

    duplicateProject: () => {
      const { current } = get();
      if (!current || !ws) return;
      saveNow();
      const state = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
      const name = uniqueName(`${current.name} copy`);
      startProject(name, state, false, get().setup);
      get().notify("info", `Duplicated. You're now editing "${name}".`);
    },

    renameProject: (name) => {
      const { current } = get();
      const trimmed = name.trim().slice(0, 80);
      if (!current || !trimmed || trimmed === current.name) return;
      set({ current: { ...current, name: trimmed } });
      lastSavedJson = ""; // name changed even though blocks didn't
      saveNow();
    },

    resetProject: () => {
      if (!ws) return;
      // ws.clear() records undo events, so Reset can be undone. One explicit group
      // keeps blocks *and* variables in a single undo step (clear() alone splits them).
      Blockly.Events.setGroup(true);
      try {
        ws.clear();
      } finally {
        Blockly.Events.setGroup(false);
      }
      saveNow();
    },

    deleteProject: (id) => {
      if (id === get().current?.id) clearTimeout(saveTimer); // don't resurrect it
      removeStored(id);
      deleteRuntime(id);
      const projects = readIndex().projects;
      set({ projects });
      if (id !== get().current?.id) return;
      const next = projects[0] && loadProject(projects[0].id);
      if (!next || !openRecord(next)) startProject(untitled(), EMPTY);
    },

    exportProject: () => {
      const { current } = get();
      if (!ws || !current) return;
      const { program, irError } = snapshot();
      if (!program) return get().notify("error", `Can't export: the program doesn't validate.\n${irError}`);
      const blob = new Blob([serializeProjectFile(current.name, program, get().setup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: fileNameFor(current.name) });
      a.click();
      URL.revokeObjectURL(url);
    },

    importProject: async (file) => {
      try {
        if (file.size > 5 * 1024 * 1024) return get().notify("error", "That file is too big to be a Circuit project (over 5 MB).");
        const result = readProjectFile(await file.text(), file.name.replace(/\.circuit\.json$|\.json$/i, ""));
        if (!result.ok) return get().notify("error", result.error);
        const { state, needsLayout } = programToBlockly(result.program);
        startProject(uniqueName(result.name), state, needsLayout, readSetup(result.setup));
        get().notify("info", `Imported "${result.name}".`);
      } catch (e) {
        get().notify("error", `Couldn't build blocks from this file, so nothing changed. (${(e as Error).message})`);
      }
    },

    notify: (kind, text) => set({ notice: { id: ++noticeId, kind, text } }),
    dismissNotice: () => set({ notice: null }),
  };
});
