"use client";

import * as Blockly from "blockly/core";
import { useEffect, useRef } from "react";
import { attachWorkspaceCallbacks, registerCircuitBlocks } from "@/lib/blocks/register";
import { STARTER_PROGRAM } from "@/lib/blocks/starter";
import { createCircuitTheme } from "@/lib/blocks/theme";
import { buildToolbox } from "@/lib/blocks/toolbox";
import { useWorkspaceStore } from "@/store/workspace";

/** The Blockly canvas. Client-only — loaded with `ssr: false`. */
export default function BlocklyWorkspace() {
  const host = useRef<HTMLDivElement>(null);
  const { setWorkspace, setStats } = useWorkspaceStore();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    registerCircuitBlocks();

    const ws = Blockly.inject(el, {
      renderer: "zelos",
      theme: createCircuitTheme(),
      toolbox: buildToolbox(),
      grid: { spacing: 28, length: 2, colour: "#1d2333", snap: false },
      zoom: { controls: true, wheel: true, startScale: 0.8, maxScale: 2, minScale: 0.35, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: false },
      trashcan: true,
      sounds: false,
      maxTrashcanContents: 64,
    });
    attachWorkspaceCallbacks(ws);
    Blockly.serialization.workspaces.load(STARTER_PROGRAM, ws);

    const updateStats = (e?: Blockly.Events.Abstract) => {
      if (e?.isUiEvent) return;
      setStats({
        blocks: ws.getAllBlocks(false).filter((b) => !b.isShadow()).length,
        scripts: ws.getTopBlocks(false).filter((b) => b.type.startsWith("events_") && !b.outputConnection).length,
      });
    };
    ws.addChangeListener(updateStats);
    updateStats();
    setWorkspace(ws);

    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(el);
    return () => {
      ro.disconnect();
      setWorkspace(null);
      ws.dispose();
    };
  }, [setWorkspace, setStats]);

  return <div ref={host} className="absolute inset-0" />;
}
