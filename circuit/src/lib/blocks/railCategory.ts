import * as Blockly from "blockly/core";
import { hueColour } from "@/lib/ui/colour";
import { CATEGORIES } from "./categories";

/**
 * Toolbox category drawn as a two-letter tag on the left rail ("EV", "CT", …).
 * The full name stays in the DOM for screen readers and shows as a tooltip.
 */
class RailCategory extends Blockly.ToolboxCategory {
  private meta() {
    return CATEGORIES.find((c) => c.name === this.name_);
  }

  protected override createIconDom_(): Element {
    const meta = this.meta();
    const tag = document.createElement("span");
    tag.className = "circuitRailTag";
    tag.textContent = meta?.code ?? this.name_.slice(0, 2).toUpperCase();
    tag.style.setProperty("--tag", hueColour(meta?.hue ?? null));
    tag.style.setProperty("--tag-line", hueColour(meta?.hue ?? null, 0.5, 0.06));
    tag.setAttribute("aria-hidden", "true");
    return tag;
  }

  protected override createLabelDom_(name: string): Element {
    const label = super.createLabelDom_(name);
    label.classList.add("circuitRailName");
    return label;
  }

  protected override createRowContainer_(): HTMLDivElement {
    const row = super.createRowContainer_();
    row.title = this.name_;
    return row;
  }

  // The rail marks selection with CSS, not a solid colour fill or side border.
  protected override addColourBorder_(): void {}

  override setSelected(isSelected: boolean): void {
    super.setSelected(isSelected);
    if (this.rowDiv_) this.rowDiv_.style.backgroundColor = "";
  }
}

let registered = false;

/** Replaces Blockly's default toolbox category with the rail tag. Client-only. */
export function registerRailCategory() {
  if (registered) return;
  registered = true;
  Blockly.registry.register(
    Blockly.registry.Type.TOOLBOX_ITEM,
    Blockly.ToolboxCategory.registrationName,
    RailCategory,
    true,
  );
}
