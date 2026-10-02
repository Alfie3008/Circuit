import {
  agentIn,
  anyIn,
  category,
  checkbox,
  dropdown,
  listIn,
  num,
  objIn,
  row,
  text,
  textIn,
  variable,
  type BlockSpec,
} from "../types";

/**
 * Agents are generic. A "rat" is CREATE AGENT with species = rat; a researcher
 * is CREATE AGENT with goal = research. There are no species-specific blocks.
 */
const agents = category("agents", "ai", [
  {
    type: "agents_create",
    ir: "create_agent",
    shape: "statement",
    rows: [
      row("create agent"),
      row("name", dropdown("NAME_MODE", ["AI generated", "manual"]), text("NAME", "")),
      row("identity", dropdown("IDENTITY_MODE", ["AI generated", "custom"]), text("IDENTITY", "")),
      row("species / type", dropdown("SPECIES_MODE", ["random from list", "free text", "AI generated"]), text("SPECIES", "cat, frog, penguin, raccoon, dog, capybara")),
      row("personality", dropdown("PERSONALITY_MODE", ["AI generated", "free text"]), text("PERSONALITY", "")),
      row("visual", dropdown("VISUAL_MODE", ["generated placeholder", "emoji", "image URL", "AI generated later"]), text("VISUAL", "")),
      row("goal", text("GOAL", "")),
      row("model", text("MODEL", "default"), "memory", checkbox("MEMORY", true)),
      row("budget", num("BUDGET", 0, { min: 0 }), "score", num("SCORE", 0)),
      row("inventory", text("INVENTORY", "")),
      row("custom state", objIn("CUSTOM")),
      row("save as", variable("VAR", "agent")),
    ],
    tooltip: "Creates a persistent agent entity: unique id, identity, properties, memory, inventory and activity history.",
  },
  {
    type: "agents_run",
    ir: "run_agent",
    shape: "statement",
    rows: [
      row("run agent", agentIn()),
      row("task", textIn("TASK", "Explore something strange on the web.")),
      row("tools", checkbox("TOOL_BROWSER", false), "browser", checkbox("TOOL_HTTP", false), "HTTP", checkbox("TOOL_IMAGE", false), "image", checkbox("TOOL_STATE", true), "state"),
      row("context", anyIn("CONTEXT", "")),
      row("save result as", variable("RESULT_VAR", "result")),
    ],
    tooltip: "Gives the agent a task. The result is an object with response, decision and data.",
  },
  {
    type: "agents_give_tool",
    ir: "give_agent_tool",
    shape: "statement",
    rows: [row("give", agentIn(), "tool", dropdown("TOOL", ["browser", "HTTP", "image", "project state"]))],
    tooltip: "Permanently grants an agent a tool.",
  },
  {
    type: "agents_remember",
    ir: "agent_remember",
    shape: "statement",
    rows: [row("remember", anyIn("MEMORY", "Something happened."), "in memory of", agentIn())],
    tooltip: "Appends an entry to the agent's memory.",
  },
  {
    type: "agents_get_prop",
    ir: "agent_get",
    shape: "reporter",
    output: null,
    rows: [row(text("PROP", "name"), "of", agentIn())],
    tooltip: "Reads a property: name, species, personality, budget, score, inventory, or any custom property.",
  },
  {
    type: "agents_set_prop",
    ir: "agent_set",
    shape: "statement",
    rows: [row("set", text("PROP", "holdings"), "of", agentIn(), "to", anyIn("VALUE", ""))],
    tooltip: "Sets a property on the agent.",
  },
  {
    type: "agents_remove",
    ir: "remove_agent",
    shape: "statement",
    rows: [row("remove agent", agentIn())],
    tooltip: "Retires the agent from the project.",
  },
  {
    type: "agents_random",
    ir: "random_agent",
    shape: "reporter",
    output: ["Agent"],
    rows: [row("random existing agent")],
    tooltip: "One of the project's agents, picked at random.",
  },
  {
    type: "agents_all",
    ir: "all_agents",
    shape: "reporter",
    output: ["List"],
    rows: [row("all agents")],
    tooltip: "A list of every agent in the project.",
  },
]);

/** Generic AI operations, independent of agents. Mocked when no API key is set. */
const ai = category("ai", "ai", [
  {
    type: "ai_ask",
    ir: "ai_ask",
    shape: "reporter",
    output: ["String"],
    rows: [row("ask AI", textIn("PROMPT", "Write a one-line motto."))],
    tooltip: "Returns the model's text answer.",
  },
  {
    type: "ai_structured",
    ir: "ai_structured",
    shape: "reporter",
    output: ["Object"],
    rows: [row("AI structured output", textIn("PROMPT", "Invent a mascot.")), row("fields", text("FIELDS", "name, mood, catchphrase"))],
    tooltip: "Returns an object with exactly the listed fields.",
  },
  {
    type: "ai_choose",
    ir: "ai_choose",
    shape: "reporter",
    output: null,
    rows: [row("AI choose from", listIn("OPTIONS", "red, green, blue")), row("because", textIn("CRITERIA", "it fits the mood"))],
    tooltip: "The model picks one option.",
  },
  {
    type: "ai_classify",
    ir: "ai_classify",
    shape: "reporter",
    output: ["String"],
    rows: [row("AI classify", textIn("TEXT", "")), row("into", text("LABELS", "positive, neutral, negative"))],
    tooltip: "Returns one of the labels.",
  },
  {
    type: "ai_summarize",
    ir: "ai_summarize",
    shape: "reporter",
    output: ["String"],
    rows: [row("AI summarize", textIn("TEXT", ""))],
    tooltip: "A short summary.",
  },
  {
    type: "ai_identity",
    ir: "ai_identity",
    shape: "reporter",
    output: ["Object"],
    rows: [row("AI generate identity for", textIn("SUBJECT", "a capybara"))],
    tooltip: "Returns an object with name, personality, bio and emoji.",
  },
  {
    type: "ai_decision",
    ir: "ai_decision",
    shape: "boolean",
    rows: [row("AI decides", textIn("QUESTION", "Is this a good idea?"))],
    tooltip: "The model answers yes or no.",
  },
]);

export const AGENT_BLOCKS: BlockSpec[] = [...agents, ...ai];
