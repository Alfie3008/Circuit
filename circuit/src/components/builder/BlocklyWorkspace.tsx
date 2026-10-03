"use client";

import * as Blockly from "blockly/core";
import { useEffect, useRef, useState } from "react";
import { registerRailCategory } from "@/lib/blocks/railCategory";
import { attachWorkspaceCallbacks, registerCircuitBlocks } from "@/lib/blocks/register";
import { CIRCUIT_RENDERER, registerCircuitRenderer } from "@/lib/blocks/renderer";
import { createCircuitTheme, loadBlockFont } from "@/lib/blocks/theme";
import { buildToolbox } from "@/lib/blocks/toolbox";
import type { Program } from "@/lib/ir";
import { DIARY } from "@/lib/marketing/demos";
import { getTemplate } from "@/lib/templates";
import { markBlock, useProjectStore } from "@/store/project";
import { useRuntimeStore } from "@/store/runtime";

/**
 * /build?template=<id> opens a template as a new project (Examples, Docs and
 * the home page link here). The parameter is removed so a reload doesn't
 * create another copy.
 */
function openFromUrl() {
  const params = new URLSearchParams(location.search);
  const remix = params.get("remix");
  if (remix) {
    // Open a published project's rules as your own copy.
    void fetch(`/api/p/${encodeURIComponent(remix)}?receipts=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((p: { name: string; program: Program }) => useProjectStore.getState().openProgram(`${p.name} (remix)`, p.program))
      .catch(() => useProjectStore.getState().notify("error", "Couldn't open that project's blocks."));
    history.replaceState(null, "", location.pathname);
    return;
  }
  const id = params.get("template");
  if (!id) return;
  const store = useProjectStore.getState();
  if (id === "blank") store.newFromTemplate(null);
  else if (id === "diary") store.openProgram("Diary characters", DIARY);
  else if (getTemplate(id)) store.newFromTemplate(id);
  history.replaceState(null, "", location.pathname);
}

/** The Blockly canvas. Client-only — loaded with `ssr: false`. */
export default function BlocklyWorkspace() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    // Wait for the block font: Blockly sizes blocks by measuring text once.
    void loadBlockFont().then((family) => {
      if (cancelled) return;
      registerCircuitBlocks();
      registerRailCategory();
      registerCircuitRenderer();

      const ws = Blockly.inject(el, {
        renderer: CIRCUIT_RENDERER,
        media: "/blockly/media/",
        theme: createCircuitTheme(family),
        toolbox: buildToolbox(),
        grid: { spacing: 20, length: 1, colour: "#ffffff1f", snap: false },
        zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.35, scaleSpeed: 1.15 },
        move: { scrollbars: true, drag: true, wheel: false },
        trashcan: true,
        sounds: false,
        comments: false,
        maxTrashcanContents: 64,
      });
      attachWorkspaceCallbacks(ws);

      const { attach, detach, flush, workspaceChanged } = useProjectStore.getState();
      attach(ws); // loads the current project (or creates the first one)
      openFromUrl();
      ws.addChangeListener(workspaceChanged);
      ws.addChangeListener((e) => {
        if (e.type === Blockly.Events.SELECTED)
          useProjectStore.setState({ selectedBlockId: (e as Blockly.Events.Selected).newElementId ?? null });
      });

      // Light up the block that is running (and the one that failed).
      const unsubRuntime = useRuntimeStore.subscribe((s, prev) => {
        if (s.live?.blockId !== prev.live?.blockId) markBlock("active", s.live?.blockId);
        if (s.errorBlockId !== prev.errorBlockId) markBlock("error", s.errorBlockId);
      });

      const ro = new ResizeObserver(() => Blockly.svgResize(ws));
      ro.observe(el);
      window.addEventListener("pagehide", flush);
      setReady(true);
      cleanup = () => {
        unsubRuntime();
        window.removeEventListener("pagehide", flush);
        ro.disconnect();
        detach();
        ws.dispose();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-xs tracking-[0.12em] text-dim">
          LOADING BLOCKS…
        </div>
      )}
    </>
  );
}
