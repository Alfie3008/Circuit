"use client";

import * as Blockly from "blockly/core";
import { useEffect, useRef, useState } from "react";
import { registerRailCategory } from "@/lib/blocks/railCategory";
import { attachWorkspaceCallbacks, registerCircuitBlocks } from "@/lib/blocks/register";
import { CIRCUIT_RENDERER, registerCircuitRenderer } from "@/lib/blocks/renderer";
import { createCircuitTheme, loadBlockFont } from "@/lib/blocks/theme";
import { buildToolbox } from "@/lib/blocks/toolbox";
import { useProjectStore } from "@/store/project";

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
      ws.addChangeListener(workspaceChanged);

      const ro = new ResizeObserver(() => Blockly.svgResize(ws));
      ro.observe(el);
      window.addEventListener("pagehide", flush);
      setReady(true);
      cleanup = () => {
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
