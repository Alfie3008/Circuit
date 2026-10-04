import {
  anyIn,
  category,
  dropdown,
  num,
  numIn,
  objIn,
  row,
  text,
  textIn,
  valueIn,
  varIn,
  variable,
  type BlockSpec,
} from "../types";

/**
 * Project World: generic entities, collections and feed. CIRCUIT doesn't know
 * whether an entity is an animal, a spaceship or a purchased item.
 */
const world = category("world", "website", [
  {
    type: "world_create_entity",
    ir: "create_entity",
    shape: "statement",
    rows: [
      row("create entity of type", text("ENTITY_TYPE", "item")),
      row("name", textIn("NAME", "Thing")),
      row("properties", objIn("PROPS")),
      row("image", anyIn("IMAGE", "📦")),
      row("save as", variable("VAR", "entity")),
    ],
    tooltip: "Creates a persistent entity that appears in the project world.",
  },
  {
    type: "world_update_entity",
    ir: "update_entity",
    shape: "statement",
    rows: [row("set", text("PROP", "status"), "of entity", varIn("ENTITY", "entity"), "to", anyIn("VALUE", ""))],
    tooltip: "Sets a property on an entity (or agent).",
  },
  {
    type: "world_delete_entity",
    ir: "delete_entity",
    shape: "statement",
    rows: [row("delete entity", varIn("ENTITY", "entity"))],
    tooltip: "Removes an entity from the world.",
  },
  {
    type: "world_add_to_world",
    ir: "add_to_world",
    shape: "statement",
    rows: [row("show in project world", varIn("ITEM", "agent"))],
    tooltip: "Places an agent or entity on the world stage.",
  },
  {
    type: "world_add_to_collection",
    ir: "add_to_collection",
    shape: "statement",
    rows: [row("add", varIn("ITEM", "entity"), "to collection", text("COLLECTION", "shelf"))],
    tooltip: "Adds an item to a named collection shown in the world (shelf, gallery, team…).",
  },
  {
    type: "world_update_feed",
    ir: "update_feed",
    shape: "statement",
    rows: [row("post to project feed", textIn("MESSAGE", "Something happened!"))],
    tooltip: "Adds a line to the project feed. {name} inserts a variable.",
  },
  {
    type: "world_update_counter",
    ir: "update_counter",
    shape: "statement",
    rows: [row("change counter", text("NAME", "visitors"), "by", numIn("BY", 1))],
    tooltip: "Changes a public counter displayed on the project site.",
  },
  {
    type: "world_website_state",
    ir: "website_state",
    shape: "statement",
    rows: [row("set website", text("KEY", "headline"), "to", anyIn("VALUE", "Hello!"))],
    tooltip: "Updates a key in the project website's public state.",
  },
  {
    type: "world_notify",
    ir: "notify",
    shape: "statement",
    rows: [row("show notification", textIn("MESSAGE", "Hello!"))],
    tooltip: "Pops a notification in the preview.",
  },
]);

/** ALL financial writes are simulated in the public prototype. */
const finance = category("finance", "finance", [
  {
    type: "finance_wallet_balance",
    ir: "wallet_balance",
    module: "solana",
    shape: "reporter",
    output: ["Number"],
    rows: [row("SOL balance of wallet", textIn("WALLET", "treasury"))],
    tooltip: "Mock balance, or a live read-only balance when Solana read mode is configured.",
  },
  {
    type: "finance_treasury",
    ir: "treasury",
    shape: "reporter",
    output: ["Number"],
    rows: [row("treasury", dropdown("ASSET", [["SOL", "SOL"], ["USDC", "USDC"]]))],
    tooltip: "The simulated project treasury balance.",
  },
  {
    type: "finance_budget",
    ir: "budget",
    shape: "reporter",
    output: ["Number"],
    rows: [row("budget", text("NAME", "computeBudget"))],
    tooltip: "The current amount in a named budget.",
  },
  {
    type: "finance_transfer",
    ir: "sim_transfer",
    shape: "statement",
    simulated: true,
    rows: [row("simulate transfer", numIn("AMOUNT", 0.1), dropdown("UNIT", [["SOL", "SOL"], ["USDC", "USDC"]]), "to wallet", textIn("TO", "wallet"))],
    tooltip: "SIMULATED. Records a transfer receipt; no funds move.",
  },
  {
    type: "finance_buy",
    ir: "sim_buy",
    shape: "statement",
    simulated: true,
    rows: [row("simulate buy", anyIn("ASSET", "META"), "for", numIn("AMOUNT", 0.03), dropdown("UNIT", [["SOL", "SOL"], ["USDC", "USDC"]]))],
    tooltip: "SIMULATED. Adds the asset to the simulated portfolio and debits the treasury.",
  },
  {
    type: "finance_sell",
    ir: "sim_sell",
    shape: "statement",
    simulated: true,
    rows: [row("simulate sell", anyIn("ASSET", "META"), "for", numIn("AMOUNT", 0.03), dropdown("UNIT", [["SOL", "SOL"], ["USDC", "USDC"]]))],
    tooltip: "SIMULATED. Removes the asset from the simulated portfolio and credits the treasury.",
  },
  {
    type: "finance_add_budget",
    ir: "budget_add",
    shape: "statement",
    rows: [row("add", numIn("AMOUNT", 1), "to budget", text("NAME", "computeBudget"))],
    tooltip: "Allocates treasury funds into a named budget.",
  },
  {
    type: "finance_spend_budget",
    ir: "budget_spend",
    shape: "statement",
    rows: [row("spend", numIn("AMOUNT", 1), "from budget", text("NAME", "computeBudget"))],
    tooltip: "Spends from a named budget. Fails if the budget is too small.",
  },
  {
    type: "finance_check_budget",
    ir: "budget_check",
    shape: "boolean",
    rows: [row("budget", text("NAME", "computeBudget"), "has at least", numIn("AMOUNT", 1))],
    tooltip: "True if the budget holds at least the amount.",
  },
  {
    type: "finance_split_budget",
    ir: "budget_split",
    shape: "statement",
    rows: [row("split", numIn("AMOUNT", 1), "from budget", text("FROM", "treasury")), row("equally into", text("INTO", "computeBudget, rewardBudget, purchaseBudget"))],
    tooltip: "Moves an amount from one budget, divided equally into others.",
  },
]);

const bounties = category("bounties", "bounties", [
  {
    type: "bounties_create",
    ir: "create_bounty",
    shape: "statement",
    rows: [
      row("create bounty", textIn("TITLE", "Make a meme")),
      row("description", textIn("DESCRIPTION", "Best meme about our project wins.")),
      row("reward", num("REWARD", 0.5, { min: 0 }), "SOL  deadline", num("HOURS", 24, { min: 1 }), "hours"),
      row("save as", variable("VAR", "bounty")),
    ],
    tooltip: "Opens a bounty. Rewards are simulated.",
  },
  {
    type: "bounties_wait",
    ir: "await_submission",
    shape: "statement",
    rows: [row("wait for submission to", varIn("BOUNTY", "bounty"))],
    tooltip: "Marks the bounty as accepting work. Submissions trigger 'when bounty submission arrives'.",
  },
  {
    type: "bounties_get_submission",
    ir: "get_submission",
    shape: "reporter",
    output: ["Object"],
    rows: [row(dropdown("WHICH", ["latest", "best scored"]), "submission of", varIn("BOUNTY", "bounty"))],
    tooltip: "Reads a submission (wallet, content, score, status).",
  },
  {
    type: "bounties_ai_review",
    ir: "ai_review",
    module: "ai",
    shape: "reporter",
    output: ["Object"],
    rows: [row("AI review", valueIn("SUBMISSION", ["Object"], { type: "events_field", fields: { FIELD: "submission" }, shadow: false })), row("criteria", textIn("CRITERIA", "Is it funny and on-topic?"))],
    tooltip: "Returns { score 0-100, approved, feedback }.",
  },
  {
    type: "bounties_approve",
    ir: "approve_submission",
    shape: "statement",
    rows: [row("approve", valueIn("SUBMISSION", ["Object"], { type: "events_field", fields: { FIELD: "submission" }, shadow: false }))],
    tooltip: "Marks the submission approved.",
  },
  {
    type: "bounties_reject",
    ir: "reject_submission",
    shape: "statement",
    rows: [row("reject", valueIn("SUBMISSION", ["Object"], { type: "events_field", fields: { FIELD: "submission" }, shadow: false }))],
    tooltip: "Marks the submission rejected.",
  },
  {
    type: "bounties_reward",
    ir: "sim_reward",
    module: "finance",
    shape: "statement",
    simulated: true,
    rows: [row("simulate reward for", valueIn("SUBMISSION", ["Object"], { type: "events_field", fields: { FIELD: "submission" }, shadow: false }))],
    tooltip: "SIMULATED. Pays the bounty reward from rewardBudget on paper.",
  },
]);

const output = category("output", "social", [
  {
    type: "output_webhook",
    ir: "send_webhook",
    shape: "statement",
    rows: [row("send webhook to", textIn("URL", "https://example.com/hook")), row("payload", anyIn("PAYLOAD", ""))],
    tooltip: "POSTs the payload as JSON to a web address. Sent for real once your coin is live; simulated in the builder.",
  },
  {
    type: "output_post",
    ir: "post_message",
    shape: "statement",
    simulated: true,
    rows: [row("post to", dropdown("DEST", [["X", "x"], ["Discord", "discord"], ["Telegram", "telegram"], ["custom", "custom"]])), row("message", textIn("MESSAGE", "gm"))],
    tooltip: "SIMULATED. Records the post it would make.",
  },
  {
    type: "output_email",
    ir: "send_email",
    shape: "statement",
    simulated: true,
    rows: [row("email / notify", text("TO", "team@example.com")), row("subject", textIn("SUBJECT", "Update")), row("body", anyIn("BODY", ""))],
    tooltip: "SIMULATED. Records the message it would send.",
  },
]);

export const WORLD_BLOCKS: BlockSpec[] = [...world, ...finance, ...bounties, ...output];
