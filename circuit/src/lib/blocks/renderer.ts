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

/** SVG for a block's category tag. */
function tagNode(block: Blockly.BlockSvg, cat: CategoryMeta, family: string): SVGGElement {
  const { Svg } = Blockly.utils;
  const g = Blockly.utils.dom.createSvgElement(Svg.G, { class: "circuitBlockTag" }, block.getSvgRoot());
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
  return g;
}

/**
 * Flatter Zelos: smaller connection tabs, 6px corners, 22px pills and tighter
 * rows, following the design's block metrics.
 */
class CircuitConstants extends Blockly.zelos.ConstantProvider {
  constructor() {
    super();
    this.CORNER_RADIUS = 6;
    this.TOP_ROW_MIN_HEIGHT = this.CORNER_RADIUS;
    this.BOTTOM_ROW_MIN_HEIGHT = this.CORNER_RADIUS;
    this.NOTCH_WIDTH = 24;
    this.NOTCH_HEIGHT = 6;
    this.NOTCH_OFFSET_LEFT = 16;
    this.STATEMENT_BOTTOM_SPACER = -this.NOTCH_HEIGHT;
    this.MIN_BLOCK_HEIGHT = 36;
    this.START_HAT_HEIGHT = 12;
    this.START_HAT_WIDTH = 80;
    this.TOP_ROW_PRECEDES_STATEMENT_MIN_HEIGHT = 8;
    this.BOTTOM_ROW_AFTER_STATEMENT_MIN_HEIGHT = 14;
    this.EMPTY_STATEMENT_INPUT_HEIGHT = 20;
    this.STATEMENT_INPUT_PADDING_LEFT = 16;
    this.EMPTY_INLINE_INPUT_HEIGHT = 22;
    this.EMPTY_INLINE_INPUT_PADDING = 28;
    this.DUMMY_INPUT_MIN_HEIGHT = 24;
    this.DUMMY_INPUT_SHADOW_MIN_HEIGHT = 22;
    this.FIELD_BORDER_RECT_X_PADDING = 9;
    this.FIELD_DROPDOWN_SVG_ARROW_PADDING = 7;
    this.MAX_DYNAMIC_CONNECTION_SHAPE_WIDTH = 28;
    this.SELECTED_GLOW_SIZE = 0.4;
  }

  /** Pills are 22px tall whatever the font metrics say. */
  override setFontConstants_(theme: Blockly.Theme): void {
    super.setFontConstants_(theme);
    this.FIELD_BORDER_RECT_HEIGHT = 22;
    this.FIELD_DROPDOWN_BORDER_RECT_HEIGHT = 22;
  }
}

/** Per-block SVG decorations (tag, header divider), created once and reused. */
const decorations = new WeakMap<Blockly.BlockSvg, Map<string, SVGElement>>();

function decoration<T extends SVGElement>(block: Blockly.BlockSvg, key: string, create: () => T): T {
  let byKey = decorations.get(block);
  if (!byKey) decorations.set(block, (byKey = new Map()));
  const existing = byKey.get(key);
  if (existing && existing.parentNode === block.getSvgRoot()) return existing as T;
  const el = create();
  byKey.set(key, el);
  return el;
}

function removeDecoration(block: Blockly.BlockSvg, key: string) {
  const el = decorations.get(block)?.get(key);
  if (el) {
    el.remove();
    decorations.get(block)!.delete(key);
  }
}

class CircuitDrawer extends Blockly.zelos.Drawer {
  protected override drawInternals_(): void {
    super.drawInternals_();
    const block = this.block_;
    const cat = categoryOf(block);
    if (!cat) return;
    this.drawTag_(cat);
    this.drawHeaderDivider_();

    // Reporters: highlight the leading keyword (RANDOM, AI, …) in the category colour.
    if (block.outputConnection && !block.isShadow()) {
      const label = block.inputList[0]?.fieldRow.find((f) => f instanceof Blockly.FieldLabel);
      const text = label?.getSvgRoot()?.querySelector("text");
      text?.style.setProperty("fill", hueColour(cat.hue, 0.84, 0.08), "important");
    }
  }

  private drawTag_(cat: CategoryMeta) {
    let elem: TagMeasurable | undefined;
    for (const row of this.info_.rows) elem = row.elements.find(isTag) ?? elem;
    if (!elem) return removeDecoration(this.block_, "tag");

    const g = decoration(this.block_, "tag", () => tagNode(this.block_, cat, this.constants_.FIELD_TEXT_FONTFAMILY));
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

  /**
   * Dashed rule between a block's header row and the rows under it (the
   * design's config section), e.g. CREATE AGENT. Not drawn above a statement
   * input: C-blocks already separate their header with the mouth.
   */
  private drawHeaderDivider_() {
    const rows = this.info_.rows;
    const inputRows = rows.filter((r) => Types.isInputRow(r));
    const [header, next] = inputRows;
    const show = !this.block_.isCollapsed() && !this.block_.outputConnection && header && next && !next.hasStatement;
    if (!show) return removeDecoration(this.block_, "divider");

    const spacer = rows[rows.indexOf(header) + 1];
    const y = Math.round(spacer.yPos + spacer.height / 2) + 0.5;
    const line = decoration(this.block_, "divider", () =>
      Blockly.utils.dom.createSvgElement(
        Blockly.utils.Svg.LINE,
        { class: "circuitHeaderDivider", "stroke-dasharray": "3 3", "stroke-width": 1 },
        this.block_.getSvgRoot(),
      ),
    );
    line.setAttribute("x1", "1");
    line.setAttribute("x2", String(this.info_.width - 1));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
  }
}

class CircuitRenderer extends Blockly.zelos.Renderer {
  protected override makeConstants_(): CircuitConstants {
    return new CircuitConstants();
  }

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

/** Registers the CIRCUIT renderer (flatter Zelos plus category tags). Client-only. */
export function registerCircuitRenderer() {
  if (registered) return;
  registered = true;
  Blockly.blockRendering.register(CIRCUIT_RENDERER, CircuitRenderer);
}
