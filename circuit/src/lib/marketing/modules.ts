/** The module catalogue shown on the home page (art and items from the design). */
export interface ModuleCard {
  name: string;
  /** Category code (EV, AI, …) — sets the chip colour. */
  code: string;
  items: string[];
  art: string;
}

export const MODULE_CARDS: ModuleCard[] = [
  { name: "Solana", code: "FN", items: ["Trade", "Transfer", "Wallet", "Balance"], art: "  .--.     .--.\n ( SOL )--( W  )\n  '--'     '--'" },
  { name: "Pump", code: "EV", items: ["Volume", "Fees", "Graduation"], art: "  |      .|\n  |   .|||\n  |.||||||\n  '-------->" },
  { name: "AI", code: "AI", items: ["Prompt", "Choose", "Classify", "Generate"], art: " > prompt_\n > think ...\n > answer #" },
  { name: "Agents", code: "AG", items: ["Create", "Run", "Memory", "Tools"], art: "   .---.\n  ( o o )\n   | = |\n  /|___|\\" },
  { name: "Web", code: "WB", items: ["Search", "Browse", "HTTP"], art: " .-------------.\n |o o https://_|\n |  #####  ..  |\n '-------------'" },
  { name: "World", code: "WD", items: ["Create Entity", "Update Entity", "Feed"], art: " .  o   .   *\n    *  .  o\n  o   .  *   ." },
  { name: "Bounties", code: "BT", items: ["Create", "Review", "Reward"], art: " [ task ]\n     |\n (submit) x14\n     |\n [reward]" },
  { name: "Webhooks", code: "IO", items: ["Receive", "Send"], art: " POST ----> [  ]\n [  ] <---- 200" },
];
