"use client";

import * as Blockly from "blockly/core";
import { useEffect, useRef } from "react";
import { attachWorkspaceCallbacks, registerCircuitBlocks } from "@/lib/blocks/register";
import { createCircuitTheme } from "@/lib/blocks/theme";
import { buildToolbox } from "@/lib/blocks/toolbox";
import { useProjectStore } from "@/store/project";

/** The Blockly canvas. Client-only — loaded with `ssr: false`. */
export default function BlocklyWorkspace() {
  const host = useRef<HTMLDivElement>(null);

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
      comments: false,
      maxTrashcanContents: 64,
    });
    attachWorkspaceCallbacks(ws);

    const { attach, detach, flush, workspaceChanged } = useProjectStore.getState();
    attach(ws); // loads the current project (or creates the first one)
    ws.addChangeListener(workspaceChanged);

    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(el);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      ro.disconnect();
      detach();
      ws.dispose();
    };
  }, []);

  return <div ref={host} className="absolute inset-0" />;
}
