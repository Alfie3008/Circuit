import * as Blockly from "blockly/core";
import { hueColour } from "@/lib/ui/colour";
import { CATEGORIES, type CategoryMeta } from "./categories";

/** Registered renderer name, passed to Blockly.inject. */
export const CIRCUIT_RENDERER = "circuit";

type Measurable = Blockly.blockRendering.Measurable;

const { Types } = Blockly.blockRendering;
const TAG_TYPE = Types.getType("CIRCUIT_TAG");

/** Category tag chip ("EV", "AG", …) at the start of a block's first row. */
const TAG = { fontPx: 9.5, padX: 4, height: 14, radius: 3 };

/** Block category, read from the style name (`events_hat`, `agents_blocks`). */
function categoryOf(block: Blockly.BlockSvg): CategoryMeta | undefined {
  const id = block.getStyleName().replace(/_(blocks|hat)$/, "");
  return CATEGORIES.find((c) => c.id === id);
}

/** Space reserved in the first row for the category tag. */
class TagMeasurable extends Blockly.blockRendering.Measurable {
  constructor(
    constants: Blockly.blockRendering.ConstantProvider,
    readonly code: string,
  ) {
    super(constants);
    this.type |= TAG_TYPE;
    // Geist Mono advances 0.6em per glyph; +2 for the 1px border on each side.
    this.width = Math.ceil(code.length * TAG.fontPx * 0.6 + TAG.padX * 2 + 2);
    this.height = TAG.height;
  }
}

const isTag = (elem: Measurable): elem is TagMeasurable => (elem.type & TAG_TYPE) !== 0;

class CircuitRenderInfo extends Blockly.zelos.RenderInfo {
  protected override createRows_(): void {
    super.createRows_();
    const block = this.block_;
    // Statement and event blocks carry a tag; reporters colour their keyword instead.
    if (block.isShadow() || block.outputConnection) return;
    const cat = categoryOf(block);
    const first = this.rows.find((r) => Types.isInputRow(r));
    if (!cat || !first) return;
    first.elements.unshift(new TagMeasurable(this.constants_, cat.code));
  }

  override getInRowSpacing_(prev: Measurable | null, next: Measurable | null): number {
    if (prev && isTag(prev)) return this.constants_.MEDIUM_PADDING;
    if (next && isTag(next)) return this.constants_.MEDIUM_PADDING;
    return super.getInRowSpacing_(prev, next);
  }
}

/** Per-block SVG for the tag, created lazily and reused across renders. */
const tagNodes = new WeakMap<Blockly.BlockSvg, SVGGElement>();

function tagNode(block: Blockly.BlockSvg, cat: CategoryMeta, family: string): SVGGElement {
  let g = tagNodes.get(block);
  if (g && g.parentNode === block.getSvgRoot()) return g;
  const { Svg } = Blockly.utils;
  g = Blockly.utils.dom.createSvgElement(Svg.G, { class: "circuitBlockTag" }, block.getSvgRoot());
  Blockly.utils.dom.createSvgElement(
    Svg.RECT,
    { rx: TAG.radius, ry: TAG.radius, fill: "none", stroke: hueColour(cat.hue, 0.5, 0.06), "stroke-width": 1 },
    g,
  );
  const text = Blockly.utils.dom.createSvgElement(
    Svg.TEXT,
    {
      fill: hueColour(cat.hue),
      "font-family": family,
      "font-size": `${TAG.fontPx}px`,
      "font-weight": 400,
      "letter-spacing": "0.06em",
      "dominant-baseline": "central",
      "text-anchor": "middle",
    },
    g,
  );
  text.textContent = cat.code;
  tagNodes.set(block, g);
  return g;
}

class CircuitDrawer extends Blockly.zelos.Drawer {
  protected override drawInternals_(): void {
    super.drawInternals_();
    const block = this.block_;
    const cat = categoryOf(block);
    if (!cat) return;

    let tag: { elem: TagMeasurable } | undefined;
    for (const row of this.info_.rows) {
      const elem = row.elements.find(isTag);
      if (elem) tag = { elem };
    }
    if (tag) {
      const { elem } = tag;
      const g = tagNode(block, cat, this.constants_.FIELD_TEXT_FONTFAMILY);
      const y = elem.centerline - elem.height / 2; // centerline is block-relative
      g.setAttribute("transform", `translate(${elem.xPos},${y})`);
      const rect = g.firstChild as SVGRectElement;
      rect.setAttribute("x", "0.5");
      rect.setAttribute("y", "0.5");
      rect.setAttribute("width", String(elem.width - 1));
      rect.setAttribute("height", String(elem.height - 1));
      const text = g.lastChild as SVGTextElement;
      text.setAttribute("x", String(elem.width / 2));
      text.setAttribute("y", String(elem.height / 2));
    }

    // Reporters: highlight the leading keyword (RANDOM, AI, …) in the category colour.
    if (block.outputConnection && !block.isShadow()) {
      const label = block.inputList[0]?.fieldRow.find((f) => f instanceof Blockly.FieldLabel);
      const text = label?.getSvgRoot()?.querySelector("text");
      if (text) text.style.fill = hueColour(cat.hue, 0.84, 0.08);
    }
  }
}

class CircuitRenderer extends Blockly.zelos.Renderer {
  protected override makeRenderInfo_(block: Blockly.BlockSvg): CircuitRenderInfo {
    return new CircuitRenderInfo(this, block);
  }

  protected override makeDrawer_(
    block: Blockly.BlockSvg,
    info: Blockly.blockRendering.RenderInfo,
  ): CircuitDrawer {
    return new CircuitDrawer(block, info as CircuitRenderInfo);
  }
}

let registered = false;

/** Registers the CIRCUIT renderer (Zelos plus category tags). Client-only. */
export function registerCircuitRenderer() {
  if (registered) return;
  registered = true;
  Blockly.blockRendering.register(CIRCUIT_RENDERER, CircuitRenderer);
}
