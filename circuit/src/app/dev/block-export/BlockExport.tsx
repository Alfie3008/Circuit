"use client";

/**
 * Exports CIRCUIT's blocks for Claude Design, drawn by the product's own
 * renderer and theme (the same code the builder uses):
 *   blocks/<category>/<type>.svg + .png   every block, with its default inputs
 *   scripts/<template>.svg + .png         the templates, as real stacks
 *   blocks.json, tokens.json, README.md   names, shapes, colours, how to use them
 * SVGs are self-contained: styles inlined, Geist Mono embedded.
 */
import * as Blockly from "blockly/core";
import { useRef, useState } from "react";
import { BLOCKS, type BlockSpec } from "@/lib/blocks";
import { CATEGORIES, categoryMeta } from "@/lib/blocks/categories";
import { registerCircuitBlocks } from "@/lib/blocks/register";
import { CIRCUIT_RENDERER, registerCircuitRenderer } from "@/lib/blocks/renderer";
import { createCircuitTheme, loadBlockFont } from "@/lib/blocks/theme";
import { irKey, itemsOf, parseProgram, programToBlockly, type IRNode, type Program } from "@/lib/ir";
import { TEMPLATES } from "@/lib/templates";
import { TOKENS } from "@/lib/ui/colour";

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linejoin",
  "stroke-linecap",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "visibility",
  "display",
];
const PNG_SCALE = 3;
const PAD = 3;

async function send(path: string, data: string, encoding: "utf8" | "base64" = "utf8") {
  const res = await fetch("/api/dev/design-export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, data, encoding }) });
  if (!res.ok) throw new Error(`Couldn't write ${path}: ${res.status}`);
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** @font-face rules for the block font, with the font files embedded, so SVGs render the same anywhere. */
async function embeddedFontCss(): Promise<string> {
  const rules: string[] = [];
  for (const sheet of [...document.styleSheets]) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of [...list]) {
      if (!(rule instanceof CSSFontFaceRule) || !/Geist Mono/i.test(rule.style.getPropertyValue("font-family"))) continue;
      const src = rule.style.getPropertyValue("src");
      const url = /url\(["']?([^"')]+)["']?\)/.exec(src)?.[1];
      if (!url) continue;
      const bytes = new Uint8Array(await (await fetch(new URL(url, sheet.href ?? location.href))).arrayBuffer());
      const css = rule.cssText.replace(/src:[^;]+;/, `src: url(data:font/woff2;base64,${toBase64(bytes)}) format("woff2");`);
      rules.push(css);
    }
  }
  return rules.join("\n");
}

/** Copies computed styles onto a cloned tree, so it looks the same outside the page's CSS. */
function inlineStyles(source: Element, clone: Element) {
  const cs = getComputedStyle(source);
  const style = STYLE_PROPS.map((p) => [p, cs.getPropertyValue(p)] as const)
    .filter(([, v]) => v && v !== "normal" && v !== "auto")
    .map(([p, v]) => `${p}:${v}`)
    .join(";");
  if (style) clone.setAttribute("style", style);
  clone.removeAttribute("class");
  const a = source.children;
  const b = clone.children;
  for (let i = 0; i < a.length; i++) inlineStyles(a[i], b[i]);
}

/** The workspace's blocks as one standalone SVG. */
function svgOf(ws: Blockly.WorkspaceSvg, fontCss: string): { svg: string; w: number; h: number } {
  const canvas = ws.getCanvas();
  const box = canvas.getBBox();
  const copy = canvas.cloneNode(true) as SVGGElement;
  inlineStyles(canvas, copy);
  copy.removeAttribute("transform");
  // XML, not outerHTML: Blockly's text uses non-breaking spaces, which outerHTML writes as &nbsp; (invalid in SVG files).
  const xml = new XMLSerializer();
  const defsEl = ws.getParentSvg().querySelector("defs");
  const defs = defsEl ? xml.serializeToString(defsEl) : "";
  const x = Math.floor(box.x) - PAD;
  const y = Math.floor(box.y) - PAD;
  const w = Math.ceil(box.width) + PAD * 2;
  const h = Math.ceil(box.height) + PAD * 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">` +
    `<style>${fontCss}</style>${defs}${xml.serializeToString(copy)}</svg>`;
  return { svg, w, h };
}

async function pngOf(svg: string, w: number, h: number): Promise<string> {
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(svg))}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w * PNG_SCALE;
  c.height = h * PNG_SCALE;
  const ctx = c.getContext("2d")!;
  ctx.scale(PNG_SCALE, PNG_SCALE);
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/png").split(",")[1];
}

/** A program holding just this block, with its default inputs. */
function programFor(spec: BlockSpec): Program | null {
  const node: IRNode = { type: spec.ir };
  // Name every statement input, so blocks sharing an IR type (if / if-else) resolve to this one.
  for (const item of itemsOf(spec)) if (item.kind === "statement") node[irKey(item.name)] = [];
  const raw =
    spec.shape === "hat"
      ? { version: 1, scripts: [{ event: node, body: [] }] }
      : spec.shape === "statement" || spec.shape === "terminal"
        ? { version: 1, scripts: [], loose: [{ body: [node] }] }
        : { version: 1, scripts: [], loose: [{ expr: node }] };
  const parsed = parseProgram(raw);
  return parsed.ok ? parsed.program : null;
}

/** Plain text of a block's face: labels as written, fields and inputs as [name]. */
function faceText(spec: BlockSpec) {
  return spec.rows
    .map((r) => r.items.map((i) => (i.kind === "label" ? i.text : i.kind === "statement" ? "{…}" : `[${i.name.toLowerCase()}]`)).join(" "))
    .join(" / ");
}

const SHAPE_WORDS: Record<string, string> = {
  hat: "event (starts a script)",
  statement: "action (stacks)",
  terminal: "action that ends a stack",
  reporter: "value (plugs into a slot)",
  boolean: "true/false (plugs into a slot)",
};

const README = (blocks: number, scripts: number) => `# CIRCUIT blocks, for Claude Design

These are CIRCUIT's real blocks, exported from the product's own renderer and
theme (the same code the builder draws with). ${blocks} blocks, ${scripts} assembled scripts.

- blocks/<category>/<type>.svg, .png: every block, alone, with its default inputs.
  SVGs are self-contained (styles inlined, Geist Mono embedded). PNGs are ${PNG_SCALE}x.
- scripts/<template>.svg, .png: the templates as real stacks, for hero shots and mockups.
- blocks.json: every block's type, category, two-letter tag, colour, shape and face text.
- tokens.json: the canvas, block and accent colours.

## Paste this into Claude Design

These SVGs are CIRCUIT's real blocks, exported from the product's renderer. Use
them as images, exactly as given. Don't redraw, restyle, recolour or rebuild them
in HTML/CSS, and don't invent blocks that aren't in this set. You can scale them
uniformly, crop to a stack, and place them on any background (they're drawn for
the dark canvas, ${TOKENS.canvas}). For text about blocks (names, categories,
colours), use blocks.json. If a design needs a block or a stack that isn't in the
set, leave a labelled placeholder box and tell me, and I'll export it.

Regenerate: run \`npm run dev\` and open /dev/block-export.
`;

export function BlockExport() {
  const host = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const say = (line: string) => setLog((l) => [...l, line]);

  const run = async () => {
    if (!host.current || busy) return;
    setBusy(true);
    setLog([]);
    let ws: Blockly.WorkspaceSvg | null = null;
    try {
      const family = await loadBlockFont();
      registerCircuitBlocks();
      registerCircuitRenderer();
      ws = Blockly.inject(host.current, {
        renderer: CIRCUIT_RENDERER,
        media: "/blockly/media/",
        theme: createCircuitTheme(family),
        zoom: { startScale: 1, controls: false, wheel: false, pinch: false },
        move: { scrollbars: false, drag: false, wheel: false },
        trashcan: false,
        sounds: false,
        comments: false,
      });
      const fontCss = await embeddedFontCss();
      say(fontCss ? "Embedded Geist Mono." : "Couldn't find Geist Mono to embed; SVGs will use a fallback font outside the app (PNGs are fine).");
      await fetch("/api/dev/design-export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true }) });

      const draw = async (program: Program, file: string, stack = false) => {
        ws!.clear();
        Blockly.Events.disable();
        try {
          Blockly.serialization.workspaces.load(programToBlockly(program).state, ws!);
          for (const b of ws!.getAllBlocks(false)) b.setMovable(false);
          Blockly.renderManagement.triggerQueuedRenders(ws!);
          if (stack) {
            let y = 0;
            for (const b of ws!.getTopBlocks(true) as Blockly.BlockSvg[]) {
              b.moveTo(new Blockly.utils.Coordinate(0, y));
              y += b.getHeightWidth().height + 40;
            }
          }
        } finally {
          Blockly.Events.enable();
        }
        // Rendering is forced above; a timeout (not a frame) also works in a background tab.
        await new Promise((r) => setTimeout(r, 0));
        const { svg, w, h } = svgOf(ws!, fontCss);
        await send(`${file}.svg`, svg);
        await send(`${file}.png`, await pngOf(svg, w, h), "base64");
        return { w, h };
      };

      const index: Record<string, unknown>[] = [];
      const skipped: string[] = [];
      for (const spec of BLOCKS) {
        const program = programFor(spec);
        if (!program) {
          skipped.push(spec.type);
          continue;
        }
        const file = `blocks/${spec.category}/${spec.type}`;
        const { w, h } = await draw(program, file);
        const cat = categoryMeta(spec.category);
        index.push({
          type: spec.type,
          category: cat.name,
          tag: cat.code,
          colour: cat.colour,
          shape: SHAPE_WORDS[spec.shape] ?? spec.shape,
          face: faceText(spec),
          description: spec.tooltip,
          simulated: !!spec.simulated,
          svg: `${file}.svg`,
          png: `${file}.png`,
          size: { width: w, height: h },
        });
        if (index.length % 10 === 0) say(`${index.length} blocks…`);
      }
      say(`${index.length} blocks exported.${skipped.length ? ` Skipped (need specific inputs): ${skipped.join(", ")}` : ""}`);

      for (const t of TEMPLATES) await draw(t.program, `scripts/${t.id}`, true);
      say(`${TEMPLATES.length} template scripts exported.`);

      await send("blocks.json", JSON.stringify({ blocks: index, categories: CATEGORIES.map(({ id, name, code, colour }) => ({ id, name, tag: code, colour })) }, null, 2));
      await send("tokens.json", JSON.stringify({ ...TOKENS, blockFont: "Geist Mono, 12px, semibold" }, null, 2));
      await send("README.md", README(index.length, TEMPLATES.length));
      say("Done: see the design-export folder.");
    } catch (e) {
      say(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      ws?.dispose();
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink p-8 font-sans text-fg">
      <h1 className="m-0 text-[24px] font-medium">Block export for Claude Design</h1>
      <p className="mt-2 max-w-[640px] text-[14px] text-fg-2">
        Draws every block with the builder&apos;s renderer and writes SVGs, PNGs and JSON to <code>circuit/design-export/</code>.
      </p>
      <button onClick={() => void run()} disabled={busy} className="mt-4 h-10 rounded-lg bg-signal px-4 text-[14px] font-medium text-signal-ink disabled:opacity-50">
        {busy ? "Exporting…" : "Export"}
      </button>
      <pre className="mt-4 whitespace-pre-wrap font-mono text-[12px] text-fg-2" data-export-log>
        {log.join("\n")}
      </pre>
      <div ref={host} style={{ width: 1600, height: 1200 }} className="mt-4 opacity-0" />
    </div>
  );
}
