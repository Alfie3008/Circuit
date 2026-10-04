import {
  agentIn,
  anyIn,
  category,
  dropdown,
  listIn,
  numIn,
  row,
  text,
  textIn,
  valueIn,
  type BlockSpec,
} from "../types";

/**
 * Web blocks are simulated unless a search API / HTTP allowlist is configured.
 * HTTP Request only ever executes GET, only to allowlisted hosts, and is off by default.
 */
const web = category("web", "browser", [
  {
    type: "web_search",
    ir: "web_search",
    shape: "reporter",
    output: ["List"],
    rows: [row("search web for", textIn("QUERY", "strange deep sea creatures"))],
    tooltip: "A list of results, each with title, url and snippet. Simulated unless a search API is configured.",
  },
  {
    type: "web_open_page",
    ir: "web_open",
    shape: "reporter",
    output: ["Object"],
    rows: [row("open page", anyIn("URL", "https://example.com"))],
    tooltip: "Opens a URL or a search result. Returns a page object (title, url, text, links).",
  },
  {
    type: "web_extract_text",
    ir: "web_extract",
    shape: "reporter",
    output: ["String"],
    rows: [row("text of page", valueIn("PAGE", ["Object"]))],
    tooltip: "The readable text of a page.",
  },
  {
    type: "web_follow_link",
    ir: "web_follow",
    shape: "reporter",
    output: ["Object"],
    rows: [row("follow link", numIn("INDEX", 1), "on page", valueIn("PAGE", ["Object"]))],
    tooltip: "Opens the nth link of a page.",
  },
  {
    type: "web_save_finding",
    ir: "save_finding",
    shape: "statement",
    rows: [row("save finding", textIn("TITLE", "Finding")), row("details", anyIn("CONTENT", "")), row("found by", agentIn())],
    tooltip: "Stores a finding in the project's findings list and on the agent.",
  },
  {
    type: "web_http",
    ir: "http_request",
    shape: "reporter",
    output: ["Object"],
    rows: [
      row("HTTP", dropdown("METHOD", ["GET", "POST", "PUT", "DELETE"].map((m) => [m, m] as [string, string])), textIn("URL", "https://api.coingecko.com/api/v3/ping")),
      row("headers", text("HEADERS", "")),
      row("body", anyIn("BODY", "")),
    ],
    tooltip: "Calls a web address and gives back { status, ok, body } (JSON bodies are read for you). Headers as \"Name: value\" lines. Public addresses only, at most 10 web calls per run. In the builder only GET is sent; other methods are sent once your coin is live.",
  },
]);

const media = category("media", "ai", [
  {
    type: "media_generate_image",
    ir: "generate_image",
    shape: "reporter",
    output: ["String"],
    rows: [row("generate image of", textIn("PROMPT", "a capybara in a tiny suit")), row("style", dropdown("STYLE", ["sticker", "pixel art", "watercolor", "3D render"]))],
    tooltip: "Returns an image URL. Demo mode returns a generated placeholder.",
  },
  {
    type: "media_generate_text",
    ir: "generate_text",
    shape: "reporter",
    output: ["String"],
    rows: [row("generate", dropdown("KIND", ["caption", "story", "diary entry", "tweet"]), "about", textIn("TOPIC", ""))],
    tooltip: "Writes a short piece of text.",
  },
  {
    type: "media_create_card",
    ir: "create_card",
    module: "website",
    shape: "statement",
    rows: [row("create card", textIn("TITLE", "New card")), row("text", anyIn("TEXT", "")), row("image", anyIn("IMAGE", ""))],
    tooltip: "Adds a visual card to the project world.",
  },
  {
    type: "media_choose_image",
    ir: "choose_image",
    shape: "reporter",
    output: ["String"],
    rows: [row("choose image from", listIn("IMAGES", "🐸, 🐱, 🐧"))],
    tooltip: "Picks one image (URL or emoji) at random.",
  },
  {
    type: "media_update_avatar",
    ir: "update_avatar",
    shape: "statement",
    rows: [row("set avatar of", agentIn(), "to", anyIn("IMAGE", "🦫"))],
    tooltip: "Changes an agent's visual.",
  },
]);

export const WEB_BLOCKS: BlockSpec[] = [...web, ...media];
