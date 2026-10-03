"use client";

import * as Blockly from "blockly/core";
import { useEffect, useRef, useState } from "react";
import { registerCircuitBlocks } from "@/lib/blocks/register";
import { CIRCUIT_RENDERER, registerCircuitRenderer } from "@/lib/blocks/renderer";
import { createCircuitTheme, loadBlockFont } from "@/lib/blocks/theme";
import { programToBlockly } from "@/lib/ir";
import type { StaticBlocksProps } from "./StaticBlocks";

/** Order blocks appear in when a program "assembles": each stack top to bottom, a block's inputs before what's inside it. */
function assemblyOrder(ws: Blockly.WorkspaceSvg): Blockly.BlockSvg[] {
  const out: Blockly.BlockSvg[] = [];
  const visit = (b: Blockly.BlockSvg | null) => {
    for (; b; b = b.getNextBlock() as Blockly.BlockSvg | null) {
      if (!b.isShadow()) out.push(b);
      const children = (type: number) =>
        b!.inputList.map((i) => (i.connection?.type === type ? (i.connection.targetBlock() as Blockly.BlockSvg | null) : null)).filter(Boolean);
      children(Blockly.ConnectionType.INPUT_VALUE).forEach(visit);
      children(Blockly.ConnectionType.NEXT_STATEMENT).forEach(visit);
    }
  };
  (ws.getTopBlocks(true) as Blockly.BlockSvg[]).forEach(visit);
  return out;
}

interface Layout {
  /** Where each stack goes (by its first block's id). */
  positions: Map<string, Blockly.utils.Coordinate>;
  bbox: { left: number; top: number };
  total: number;
}

/**
 * The studio's real blocks: same renderer, theme and CSS as the builder, on a
 * canvas that ignores the mouse and keyboard. Sized to fit the full program, so
 * revealing blocks one by one doesn't make the page jump.
 */
export default function StaticBlocksCanvas({
  program,
  zoom = 0.9,
  layout = "column",
  gap = 32,
  padding = 4,
  visible,
  hidden,
  active,
  done,
  target,
  onReady,
}: StaticBlocksProps) {
  const host = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const shownRef = useRef<Set<string>>(new Set());
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState(0);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const state = programToBlockly(program).state;

  // Build the workspace once per program, measure the full program, remember the layout.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let ws: Blockly.WorkspaceSvg | null = null;
    void loadBlockFont().then((family) => {
      if (cancelled) return;
      registerCircuitBlocks();
      registerCircuitRenderer();
      ws = Blockly.inject(el, {
        renderer: CIRCUIT_RENDERER,
        media: "/blockly/media/",
        theme: createCircuitTheme(family),
        zoom: { startScale: zoom, controls: false, wheel: false, pinch: false },
        move: { scrollbars: false, drag: false, wheel: false },
        trashcan: false,
        sounds: false,
        comments: false,
      });
      wsRef.current = ws;
      Blockly.Events.disable();
      try {
        Blockly.serialization.workspaces.load(programToBlockly(program).state, ws);
      } finally {
        Blockly.Events.enable();
      }
      // A picture: nothing moves, and Blockly won't "bump" stacks around.
      for (const b of ws.getAllBlocks(false)) b.setMovable(false);
      // Blockly renders on the next frame; draw now so sizes can be measured.
      Blockly.renderManagement.triggerQueuedRenders(ws);
      const positions = new Map<string, Blockly.utils.Coordinate>();
      let cursor = 0;
      // No move events: a canvas without scrollbars would pull blocks it thinks are off-screen back in.
      Blockly.Events.disable();
      for (const b of ws.getTopBlocks(true) as Blockly.BlockSvg[]) {
        const box = b.getHeightWidth();
        const at = new Blockly.utils.Coordinate(layout === "row" ? cursor : 0, layout === "row" ? 0 : cursor);
        b.moveTo(at);
        positions.set(b.id, at);
        // Keep separate stacks beyond snapping distance, or Blockly "bumps" them into each other.
        cursor += (layout === "row" ? box.width : box.height) + Math.max(gap, Blockly.config.snapRadius + 12);
      }
      Blockly.Events.enable();
      const bbox = ws.getBlocksBoundingBox();
      const total = assemblyOrder(ws).length;
      layoutRef.current = { positions, bbox: { left: bbox.left, top: bbox.top }, total };
      shownRef.current = new Set(assemblyOrder(ws).map((b) => b.id));
      setSize({
        w: Math.ceil((bbox.right - bbox.left) * zoom) + padding * 2 + 2,
        h: Math.ceil((bbox.bottom - bbox.top) * zoom) + padding * 2 + 2,
      });
      requestAnimationFrame(() => {
        if (!ws || cancelled) return;
        Blockly.svgResize(ws);
        ws.translate(-bbox.left * zoom + padding, -bbox.top * zoom + padding);
        setReady((n) => n + 1);
        onReadyRef.current?.(total);
      });
    });
    return () => {
      cancelled = true;
      ws?.dispose();
      wsRef.current = null;
    };
  }, [program, zoom, layout, gap, padding]);

  // Which blocks are on the canvas (for reveals), and which are lit.
  const hiding = hidden !== undefined;
  const hiddenKey = (hidden ?? []).join(",");
  const doneKey = (done ?? []).join(",");
  useEffect(() => {
    const ws = wsRef.current;
    const lay = layoutRef.current;
    if (!ws || !lay || !ready) return;

    if (visible !== undefined || hiding) {
      // Rebuild with only the visible blocks, so stacks and brackets grow as pieces snap in.
      Blockly.Events.disable();
      try {
        ws.clear();
        Blockly.serialization.workspaces.load(state, ws);
        for (const b of ws.getTopBlocks(false) as Blockly.BlockSvg[]) {
          const at = lay.positions.get(b.id);
          if (at) b.moveTo(at);
        }
        const hide = new Set(hiddenKey ? hiddenKey.split(",") : []);
        for (const b of ws.getAllBlocks(false)) b.setMovable(false);
        const order = assemblyOrder(ws);
        const drop = order.filter((b, i) => (visible !== undefined && i >= visible) || hide.has(b.id));
        for (const b of drop) if (!b.isDisposed()) b.dispose(false);
      } finally {
        Blockly.Events.enable();
      }
      ws.translate(-lay.bbox.left * zoom + padding, -lay.bbox.top * zoom + padding);
      // Fade in what just appeared.
      const now = assemblyOrder(ws);
      for (const b of now) {
        if (shownRef.current.has(b.id)) continue;
        const root = b.getSvgRoot();
        root.style.opacity = "0";
        root.style.transition = "opacity 260ms ease";
        requestAnimationFrame(() => requestAnimationFrame(() => (root.style.opacity = "1")));
      }
      shownRef.current = new Set(now.map((b) => b.id));
    }

    const doneSet = new Set(doneKey ? doneKey.split(",") : []);
    for (const b of assemblyOrder(ws)) {
      const root = b.getSvgRoot();
      root.classList.toggle("circuitActive", b.id === active);
      root.classList.toggle("circuitDone", doneSet.has(b.id) && b.id !== active);
      root.classList.toggle("circuitTarget", b.id === target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, visible, hiding, hiddenKey, active, doneKey, target]);

  useEffect(() => {
    if (wsRef.current && size) Blockly.svgResize(wsRef.current);
  }, [size]);

  return (
    <div
      ref={host}
      aria-hidden
      inert
      className="static-blocks pointer-events-none select-none"
      style={{ width: size?.w ?? "100%", height: size?.h ?? 120, opacity: ready ? 1 : 0, transition: "opacity 200ms" }}
    />
  );
}
