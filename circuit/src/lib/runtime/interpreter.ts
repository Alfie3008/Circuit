/**
 * The CIRCUIT interpreter: a controlled walk over Circuit IR. No user or AI
 * code is ever evaluated; each node type maps to a fixed behaviour below, and
 * the outside world is reached only through adapters.
 *
 * `runScript` is an async generator that yields *before* each statement runs,
 * so a controller can highlight the block, wait, pause, single-step or stop.
 * State is mutated in place as the script runs (side effects are real within
 * the simulation); every effect is written to the receipt.
 */
import { resolveSpec, type Expr, type IRNode, type Script } from "@/lib/ir";
import type { Adapters } from "./adapters";
import type { CircuitEvent } from "./events";
import { listField } from "./events";
import type { Rng } from "./rng";
import { hash } from "./rng";
import type { Agent, Bounty, Entity, Receipt, ReceiptEntry, RunStatus, RuntimeState, Submission } from "./state";
import {
  clone,
  compareValues,
  equals,
  isObject,
  isRef,
  ref,
  round,
  toList,
  toNumber,
  toText,
  truthy,
  type Ref,
  type Value,
} from "./values";

/** Most statements (and loop iterations) one execution may run. */
export const MAX_STEPS = 500;
/** Most iterations a single REPEAT may ask for. */
export const MAX_REPEAT = 1000;

export interface Frame {
  id?: string;
  op: string;
  label: string;
}

export type Trace =
  | { kind: "step"; id?: string; op: string; label: string; stack: Frame[]; focusAgent: string | null }
  | { kind: "wait"; id?: string; seconds: number; stack: Frame[] };

export interface RunContext {
  /** Mutated in place. */
  state: RuntimeState;
  rng: Rng;
  adapters: Adapters;
  /** Entries are appended as the script runs. */
  receipt: Receipt;
  /** What `event [field]` returns. */
  payload: Record<string, Value>;
  maxSteps?: number;
  now?: () => number;
  /** Events the program raises itself (an agent finishing a task). */
  raise?: (event: CircuitEvent) => void;
}

export interface RunResult {
  status: RunStatus;
  error: string | null;
  errorBlockId?: string;
  /** STOP [all scripts] was hit: drop queued executions too. */
  stopAll: boolean;
  steps: number;
  /** Agent most recently created or used, for the debugger. */
  focusAgent: string | null;
}

export class RuntimeError extends Error {
  constructor(
    message: string,
    public nodeId?: string,
  ) {
    super(message);
  }
}
class StopSignal {
  constructor(public all: boolean) {}
}
class StepLimit extends Error {}

/** "create agent" → "CREATE AGENT": the block's leading words. */
export function labelOf(node: IRNode): string {
  const spec = resolveSpec(node);
  const first = spec?.rows[0]?.items.find((i) => i.kind === "label");
  return (first && first.kind === "label" ? first.text : node.type.replace(/_/g, " ")).toUpperCase();
}

const fmt = (n: number) => String(round(n, 4));
const sol = (n: number, unit = "SOL") => `${fmt(n)} ${unit}`;

class Interpreter {
  private steps = 0;
  private stack: Frame[] = [];
  private current?: IRNode;
  focusAgent: string | null = null;

  constructor(private ctx: RunContext) {}

  private get state() {
    return this.ctx.state;
  }
  private get rng() {
    return this.ctx.rng;
  }
  private now() {
    return this.ctx.now?.() ?? Date.now();
  }
  private newId(prefix: string) {
    return `${prefix}_${this.state.nextId++}`;
  }

  // -------------------------------------------------------------------------
  // Receipts
  // -------------------------------------------------------------------------

  private log(text: string, details: string[] = [], opts: Partial<ReceiptEntry> = {}, node = this.current) {
    this.ctx.receipt.entries.push({
      op: (node?.type ?? "event").toUpperCase(),
      blockId: node?.id,
      text,
      details,
      status: "ok",
      ...opts,
    });
  }

  private fail(message: string): never {
    throw new RuntimeError(message, this.current?.id);
  }

  private tick() {
    if (++this.steps > (this.ctx.maxSteps ?? MAX_STEPS)) throw new StepLimit();
  }

  // -------------------------------------------------------------------------
  // Values
  // -------------------------------------------------------------------------

  /** Name for a ref (agents show their name, not their id). */
  private names = (r: Ref): string | undefined => {
    switch (r.$ref) {
      case "agent":
        return this.state.agents.find((a) => a.id === r.id)?.name ?? `(removed agent)`;
      case "entity":
        return this.state.entities.find((e) => e.id === r.id)?.name ?? `(deleted ${r.id})`;
      case "bounty":
        return this.state.bounties.find((b) => b.id === r.id)?.title;
      case "submission":
        return this.findSubmission(r.id)?.submission.content;
    }
  };

  display(v: Value | undefined): string {
    return toText(v, this.names);
  }

  /** "{clicks}" → the variable's value; "{event.amount}" → the event field. */
  private interpolate(text: string): string {
    return text.replace(/\{([\w.]+)\}/g, (whole, name: string) => {
      if (name.startsWith("event.")) {
        const v = this.ctx.payload[name.slice(6)];
        return v === undefined ? whole : this.display(v);
      }
      return name in this.state.variables ? this.display(this.state.variables[name]) : whole;
    });
  }

  /** A text field of the current node, with {variables} filled in. */
  private field(node: IRNode, key: string): string {
    const v = node[key];
    return typeof v === "string" ? this.interpolate(v) : toText(v as Value);
  }

  async eval(expr: Expr | null | undefined): Promise<Value> {
    if (expr === null || expr === undefined) return null;
    if (typeof expr === "string") return this.interpolate(expr);
    if (typeof expr === "number" || typeof expr === "boolean") return expr;
    if (Array.isArray(expr)) return [...expr];
    return this.reporter(expr);
  }

  private async input(node: IRNode, key: string): Promise<Value> {
    return this.eval(node[key] as Expr | null | undefined);
  }
  private async num(node: IRNode, key: string) {
    return toNumber(await this.input(node, key));
  }
  private async text(node: IRNode, key: string) {
    return this.display(await this.input(node, key));
  }

  // -------------------------------------------------------------------------
  // Persistent things
  // -------------------------------------------------------------------------

  private agentOf(v: Value, what = "agent"): Agent {
    let agent: Agent | undefined;
    if (isRef(v, "agent")) {
      agent = this.state.agents.find((a) => a.id === v.id);
      if (!agent) this.fail("That agent no longer exists.");
    } else if (typeof v === "string" && v) {
      agent = this.state.agents.find((a) => a.id === v || a.name.toLowerCase() === v.toLowerCase());
    }
    if (!agent) this.fail(`No ${what} here. Connect an agent, e.g. the “agent” variable set by CREATE AGENT.`);
    this.focusAgent = agent.id;
    return agent;
  }

  private entityOf(v: Value): Entity {
    const e = isRef(v, "entity")
      ? this.state.entities.find((x) => x.id === v.id)
      : this.state.entities.find((x) => x.name.toLowerCase() === this.display(v).toLowerCase());
    if (!e) this.fail("No entity here. Connect the variable set by CREATE ENTITY.");
    return e;
  }

  private bountyOf(v: Value): Bounty {
    const b = isRef(v, "bounty")
      ? this.state.bounties.find((x) => x.id === v.id)
      : [...this.state.bounties].reverse().find((x) => x.status === "open");
    if (!b) this.fail("No bounty here. Create one with CREATE BOUNTY first.");
    return b;
  }

  private findSubmission(id: string): { bounty: Bounty; submission: Submission } | undefined {
    for (const bounty of this.state.bounties) {
      const submission = bounty.submissions.find((s) => s.id === id);
      if (submission) return { bounty, submission };
    }
  }

  private submissionOf(v: Value) {
    const found = isRef(v, "submission") ? this.findSubmission(v.id) : undefined;
    if (!found) this.fail("No submission here. Use GET SUBMISSION or the event's submission.");
    return found;
  }

  /** Plain view of a ref, so GET KEY works on agents, entities and submissions. */
  private view(v: Value): Value {
    if (!isRef(v)) return v;
    if (v.$ref === "agent") {
      const a = this.state.agents.find((x) => x.id === v.id);
      return a ? clone({ ...a.custom, id: a.id, name: a.name, species: a.species, personality: a.personality, goal: a.goal, budget: a.budget, score: a.score }) : null;
    }
    if (v.$ref === "entity") {
      const e = this.state.entities.find((x) => x.id === v.id);
      return e ? clone({ ...e.props, id: e.id, type: e.type, name: e.name, image: e.image }) : null;
    }
    if (v.$ref === "submission") {
      const s = this.findSubmission(v.id)?.submission;
      return s ? clone({ id: s.id, wallet: s.wallet, content: s.content, score: s.score, status: s.status }) : null;
    }
    const b = this.state.bounties.find((x) => x.id === v.id);
    return b ? clone({ id: b.id, title: b.title, reward: b.reward, status: b.status, submissions: b.submissions.length }) : null;
  }

  private spend(amount: number, unit: "SOL" | "USDC", what: string) {
    if (amount < 0) this.fail(`${what}: amount can't be negative.`);
    const have = this.state.treasury[unit];
    if (have < amount) this.fail(`Insufficient treasury: ${sol(have, unit)} < ${sol(amount, unit)}`);
    this.state.treasury[unit] = round(have - amount);
  }

  private feed(text: string, kind: "post" | "notify" = "post") {
    this.state.feed.push({ at: this.now(), kind, text, run: this.ctx.receipt.id });
  }

  // -------------------------------------------------------------------------
  // Statements
  // -------------------------------------------------------------------------

  async *block(list: IRNode[] | undefined): AsyncGenerator<Trace, void> {
    for (const node of list ?? []) {
      if (node.disabled) continue;
      this.tick();
      const frame = { id: node.id, op: node.type, label: labelOf(node) };
      const parent = this.current;
      this.stack.push(frame);
      this.current = node;
      yield { kind: "step", id: node.id, op: node.type, label: frame.label, stack: [...this.stack], focusAgent: this.focusAgent };
      yield* this.stmt(node);
      this.stack.pop();
      this.current = parent;
    }
  }

  private async *stmt(node: IRNode): AsyncGenerator<Trace, void> {
    const s = this.state;
    const vars = s.variables;
    const varName = () => String(node.var);

    switch (node.type) {
      // ---- Control ----
      case "if": {
        const pass = truthy(await this.input(node, "condition"));
        this.log(pass ? "Condition passed" : "Condition failed");
        yield* this.block((pass ? node.then : node.else) as IRNode[] | undefined);
        return;
      }
      case "repeat": {
        const n = Math.max(0, Math.floor(await this.num(node, "times")));
        if (n > MAX_REPEAT) this.fail(`REPEAT ${n} is more than the ${MAX_REPEAT} allowed.`);
        this.log(`Repeat ${n} ${n === 1 ? "time" : "times"}`);
        for (let i = 0; i < n; i++) {
          this.tick();
          yield* this.block(node.do as IRNode[]);
        }
        return;
      }
      case "for_each": {
        const items = toList(await this.input(node, "list"));
        this.log(`Looping ${items.length} ${items.length === 1 ? "item" : "items"}`);
        for (const item of items) {
          this.tick();
          vars[varName()] = item;
          yield* this.block(node.do as IRNode[]);
        }
        return;
      }
      case "wait": {
        const seconds = Math.max(0, await this.num(node, "seconds"));
        yield { kind: "wait", id: node.id, seconds, stack: [...this.stack] };
        this.log(`Waited ${fmt(seconds)}s`);
        return;
      }
      case "cooldown": {
        const key = node.id ?? JSON.stringify(node);
        const last = s.cooldowns[key] ?? 0;
        const seconds = toNumber(node.seconds as Value);
        const left = last + seconds * 1000 - this.now();
        if (left > 0) {
          this.log(`Cooling down (${Math.ceil(left / 1000)}s left), skipped`, [], { status: "skipped" });
          return;
        }
        s.cooldowns[key] = this.now();
        this.log(`Cooldown ${fmt(seconds)}s started`);
        yield* this.block(node.do as IRNode[]);
        return;
      }
      case "stop":
        this.log(node.scope === "all_scripts" ? "Stopped all scripts" : "Stopped this script");
        throw new StopSignal(node.scope === "all_scripts");
      case "parallel":
        this.log("Running both branches (one after the other in the simulator)");
        yield* this.block(node.a as IRNode[]);
        yield* this.block(node.b as IRNode[]);
        return;
      case "sequence":
        this.log(`Sequence “${this.field(node, "name")}”`);
        yield* this.block(node.do as IRNode[]);
        return;
      case "random_chance": {
        const percent = await this.num(node, "percent");
        const roll = this.rng.next() * 100;
        const pass = roll < percent;
        this.log(pass ? `Chance hit (${fmt(percent)}%)` : `Chance missed (${fmt(percent)}%)`);
        yield* this.block((pass ? node.then : node.else) as IRNode[]);
        return;
      }
      case "switch": {
        const v = await this.input(node, "value");
        for (const i of [1, 2, 3]) {
          if (equals(v, this.field(node, `case${i}`))) {
            this.log(`Matched “${this.field(node, `case${i}`)}”`);
            yield* this.block(node[`do${i}`] as IRNode[]);
            return;
          }
        }
        this.log("No case matched, ran default");
        yield* this.block(node.default as IRNode[]);
        return;
      }

      // ---- Variables ----
      case "set_var": {
        const v = await this.input(node, "value");
        vars[varName()] = v;
        this.log(`${varName()} = ${this.display(v)}`);
        return;
      }
      case "change_var": {
        const by = await this.num(node, "by");
        const from = toNumber(vars[varName()] ?? 0);
        vars[varName()] = round(from + by);
        this.log(`${varName()} ${fmt(from)} → ${fmt(round(from + by))}`);
        return;
      }
      case "increment_var": {
        const from = toNumber(vars[varName()] ?? 0);
        vars[varName()] = from + 1;
        this.log(`${varName()} ${fmt(from)} → ${fmt(from + 1)}`);
        return;
      }
      case "reset_var":
        vars[varName()] = 0;
        this.log(`${varName()} reset to 0`);
        return;
      case "append_list": {
        const v = await this.input(node, "value");
        const cur = vars[varName()];
        const list = Array.isArray(cur) ? [...cur] : cur === undefined || cur === null || cur === 0 || cur === "" ? [] : [cur];
        list.push(v);
        vars[varName()] = list;
        this.log(`Added ${this.display(v)} to ${varName()} (${list.length})`);
        return;
      }
      case "remove_list": {
        const list = toList(vars[varName()] ?? []).slice();
        const before = list.length;
        if (node.mode === "first_item") list.shift();
        else if (node.mode === "last_item") list.pop();
        else {
          const v = await this.input(node, "value");
          vars[varName()] = list.filter((x) => !equals(x, v));
          this.log(`Removed ${before - toList(vars[varName()]).length} from ${varName()}`);
          return;
        }
        vars[varName()] = list;
        this.log(`Removed ${before - list.length} from ${varName()}`);
        return;
      }

      // ---- Agents ----
      case "create_agent": {
        const agent = await this.createAgent(node);
        s.agents.push(agent);
        vars[varName()] = ref("agent", agent.id);
        this.focusAgent = agent.id;
        const usedAi = [node.nameMode, node.identityMode, node.personalityMode, node.speciesMode].includes("ai_generated");
        this.log(`Agent ${agent.name} created`, [`ID ${agent.id}`, `Species ${agent.species}`, `Personality ${agent.personality}`, ...(usedAi ? [`AI: ${this.ctx.adapters.ai.label}`] : [])]);
        return;
      }
      case "run_agent": {
        const agent = this.agentOf(await this.input(node, "agent"));
        const task = await this.text(node, "task");
        const tools = [
          node.toolBrowser && "browser",
          node.toolHttp && "http",
          node.toolImage && "image",
          node.toolState && "project_state",
          ...agent.tools,
        ].filter((t, i, a): t is string => !!t && a.indexOf(t) === i);
        const context = await this.text(node, "context");
        const result = await this.ctx.adapters.ai.runAgent(agent, task, tools, context);
        agent.history.push({ at: this.now(), text: result });
        if (agent.memoryEnabled) agent.memory.push(`Task: ${task}`);
        vars[String(node.resultVar)] = result;
        this.log(`${agent.name} ran: ${task}`, [result, `AI: ${this.ctx.adapters.ai.label}`]);
        this.ctx.raise?.({
          type: "agent_completes",
          source: "runtime",
          timestamp: this.now(),
          data: { agent: ref("agent", agent.id), result },
        });
        return;
      }
      case "give_agent_tool": {
        const agent = this.agentOf(await this.input(node, "agent"));
        const tool = String(node.tool);
        if (!agent.tools.includes(tool)) agent.tools.push(tool);
        this.log(`${agent.name} can now use ${tool.replace("_", " ")}`);
        return;
      }
      case "agent_remember": {
        const memory = await this.text(node, "memory");
        const agent = this.agentOf(await this.input(node, "agent"));
        agent.memory.push(memory);
        this.log(`${agent.name} remembers “${memory}”`, agent.memoryEnabled ? [] : ["Memory was off for this agent; stored anyway"]);
        return;
      }
      case "agent_set": {
        const prop = this.field(node, "prop");
        const agent = this.agentOf(await this.input(node, "agent"));
        const v = await this.input(node, "value");
        this.setAgentProp(agent, prop, v);
        this.log(`${agent.name}.${prop} = ${this.display(v)}`);
        return;
      }
      case "remove_agent": {
        const agent = this.agentOf(await this.input(node, "agent"));
        s.agents = s.agents.filter((a) => a.id !== agent.id);
        this.focusAgent = null;
        this.log(`Agent ${agent.name} removed`);
        return;
      }

      // ---- Web ----
      case "save_finding": {
        const title = await this.text(node, "title");
        const content = await this.input(node, "content");
        const agentVal = await this.input(node, "agent");
        const agent = isRef(agentVal, "agent") ? this.agentOf(agentVal) : null;
        (s.collections.findings ??= []).push({ title, content, agent: agent ? agent.name : null, at: this.now() });
        if (agent) agent.history.push({ at: this.now(), text: `Saved finding “${title}”` });
        this.log(`Finding saved: “${title}”`, [`${s.collections.findings.length} findings`]);
        return;
      }

      // ---- Media ----
      case "create_card": {
        const title = await this.text(node, "title");
        const entity: Entity = {
          id: this.newId("card"),
          type: "card",
          name: title,
          props: { text: await this.text(node, "text") },
          image: await this.text(node, "image"),
          createdAt: this.now(),
        };
        s.entities.push(entity);
        this.log(`Card “${title}” added to the world`);
        return;
      }
      case "update_avatar": {
        const agent = this.agentOf(await this.input(node, "agent"));
        const image = await this.text(node, "image");
        agent.visual = { mode: /^https?:/.test(image) ? "image" : image.length <= 4 ? "emoji" : "placeholder", value: image };
        this.log(`${agent.name}'s avatar updated`);
        return;
      }

      // ---- World ----
      case "create_entity": {
        const propsVal = await this.input(node, "props");
        const entity: Entity = {
          id: this.newId("entity"),
          type: this.field(node, "entityType") || "item",
          name: (await this.text(node, "name")) || "Untitled",
          props: isObject(propsVal) ? clone(propsVal) : {},
          image: await this.text(node, "image"),
          createdAt: this.now(),
        };
        s.entities.push(entity);
        vars[varName()] = ref("entity", entity.id);
        this.log(`${entity.type} “${entity.name}” created`, [`ID ${entity.id}`]);
        return;
      }
      case "update_entity": {
        const prop = this.field(node, "prop");
        const entity = this.entityOf(await this.input(node, "entity"));
        const v = await this.input(node, "value");
        if (prop === "name") entity.name = this.display(v);
        else if (prop === "image") entity.image = this.display(v);
        else entity.props[prop] = v;
        this.log(`${entity.name}.${prop} = ${this.display(v)}`);
        return;
      }
      case "delete_entity": {
        const entity = this.entityOf(await this.input(node, "entity"));
        s.entities = s.entities.filter((e) => e.id !== entity.id);
        this.log(`${entity.type} “${entity.name}” deleted`);
        return;
      }
      case "add_to_world": {
        const item = await this.input(node, "item");
        if (isRef(item, "agent")) {
          const agent = this.agentOf(item);
          agent.inWorld = true;
          this.log("World updated", [`${agent.name} joined the world`]);
        } else if (isRef(item, "entity")) {
          const e = this.entityOf(item);
          this.log("World updated", [`${e.name} is in the world`]);
        } else {
          const name = this.display(item) || "Something";
          s.entities.push({ id: this.newId("entity"), type: "item", name, props: {}, image: "", createdAt: this.now() });
          this.log("World updated", [`“${name}” added`]);
        }
        return;
      }
      case "add_to_collection": {
        const item = await this.input(node, "item");
        const name = this.field(node, "collection") || "collection";
        (s.collections[name] ??= []).push(item);
        this.log(`Added ${this.display(item)} to ${name} (${s.collections[name].length})`);
        return;
      }
      case "update_feed": {
        const message = await this.text(node, "message");
        this.feed(message);
        this.log(`Posted to feed: “${message}”`);
        return;
      }
      case "update_counter": {
        const name = this.field(node, "name") || "counter";
        const by = await this.num(node, "by");
        const from = s.counters[name] ?? 0;
        s.counters[name] = round(from + by);
        this.log(`${name} ${fmt(from)} → ${fmt(s.counters[name])}`);
        return;
      }
      case "website_state": {
        const key = this.field(node, "key") || "key";
        const v = await this.input(node, "value");
        s.website[key] = v;
        this.log(`Website ${key} = ${this.display(v)}`);
        return;
      }
      case "notify": {
        const message = await this.text(node, "message");
        this.feed(message, "notify");
        this.log(`Notification: “${message}”`);
        return;
      }

      // ---- Finance (always simulated) ----
      case "sim_transfer": {
        const amount = await this.num(node, "amount");
        const unit = node.unit === "USDC" ? "USDC" : "SOL";
        const to = await this.text(node, "to");
        this.spend(amount, unit, "Transfer");
        this.log(`Simulated transfer ${sol(amount, unit)} → ${to || "(no wallet)"}`, [], { simulated: true });
        return;
      }
      case "sim_buy": {
        const asset = (await this.text(node, "asset")) || "ASSET";
        const amount = await this.num(node, "amount");
        const unit = node.unit === "USDC" ? "USDC" : "SOL";
        this.spend(amount, unit, "Buy");
        s.portfolio[asset] = round((s.portfolio[asset] ?? 0) + amount);
        this.log(`Simulated purchase ${sol(amount, unit)} → ${asset}`, [], { simulated: true });
        return;
      }
      case "sim_sell": {
        const asset = (await this.text(node, "asset")) || "ASSET";
        const amount = await this.num(node, "amount");
        const unit = node.unit === "USDC" ? "USDC" : "SOL";
        const held = s.portfolio[asset] ?? 0;
        if (held < amount) this.fail(`Can't sell ${sol(amount, unit)} of ${asset}: holding ${sol(held, unit)}.`);
        s.portfolio[asset] = round(held - amount);
        if (s.portfolio[asset] === 0) delete s.portfolio[asset];
        s.treasury[unit] = round(s.treasury[unit] + amount);
        this.log(`Simulated sale ${sol(amount, unit)} of ${asset}`, [], { simulated: true });
        return;
      }
      case "budget_add": {
        const amount = await this.num(node, "amount");
        const name = this.field(node, "name") || "budget";
        this.spend(amount, "SOL", "Budget");
        s.budgets[name] = round((s.budgets[name] ?? 0) + amount);
        this.log(`${sol(amount)} moved from treasury to ${name}`, [`${name}: ${sol(s.budgets[name])}`], { simulated: true });
        return;
      }
      case "budget_spend": {
        const amount = await this.num(node, "amount");
        const name = this.field(node, "name") || "budget";
        const have = s.budgets[name] ?? 0;
        if (have < amount) this.fail(`Insufficient budget “${name}”: ${sol(have)} < ${sol(amount)}`);
        s.budgets[name] = round(have - amount);
        this.log(`Spent ${sol(amount)} from ${name}`, [`${name}: ${sol(s.budgets[name])}`], { simulated: true });
        return;
      }
      case "budget_split": {
        const amount = await this.num(node, "amount");
        const from = this.field(node, "from") || "treasury";
        const into = listField(node.into);
        if (!into.length) this.fail("SPLIT BUDGET needs at least one budget to split into.");
        if (from === "treasury") this.spend(amount, "SOL", "Split");
        else {
          const have = s.budgets[from] ?? 0;
          if (have < amount) this.fail(`Insufficient budget “${from}”: ${sol(have)} < ${sol(amount)}`);
          s.budgets[from] = round(have - amount);
        }
        const share = round(amount / into.length);
        for (const b of into) s.budgets[b] = round((s.budgets[b] ?? 0) + share);
        this.log(`Split ${sol(amount)} from ${from} into ${into.join(", ")}`, [`${sol(share)} each`], { simulated: true });
        return;
      }

      // ---- Bounties ----
      case "create_bounty": {
        const bounty: Bounty = {
          id: this.newId("bounty"),
          title: (await this.text(node, "title")) || "Untitled bounty",
          description: await this.text(node, "description"),
          reward: toNumber(node.reward as Value),
          deadline: this.now() + toNumber(node.hours as Value) * 3600_000,
          status: "open",
          submissions: [],
          createdAt: this.now(),
        };
        s.bounties.push(bounty);
        vars[varName()] = ref("bounty", bounty.id);
        this.log(`Bounty opened: “${bounty.title}”`, [`Reward ${sol(bounty.reward)}`, `ID ${bounty.id}`]);
        return;
      }
      case "await_submission": {
        const bounty = this.bountyOf(await this.input(node, "bounty"));
        const wallets = ["7xQ…f3a", "9pR…k2d", "4mT…z8w", "2bN…c5e"];
        const submission: Submission = {
          id: this.newId("sub"),
          wallet: this.rng.pick(wallets)!,
          content: `Entry #${bounty.submissions.length + 1} for “${bounty.title}”`,
          score: null,
          feedback: "",
          status: "pending",
          at: this.now(),
        };
        bounty.submissions.push(submission);
        this.log(`Submission received (simulated) from ${submission.wallet}`, [], { simulated: true });
        // Scripts listening for "when bounty submission arrives" handle it next.
        this.ctx.raise?.({
          type: "bounty_submission",
          source: "runtime",
          timestamp: this.now(),
          data: { submission: ref("submission", submission.id), bounty: ref("bounty", bounty.id), wallet: submission.wallet },
        });
        return;
      }
      case "approve_submission":
      case "reject_submission": {
        const { submission } = this.submissionOf(await this.input(node, "submission"));
        submission.status = node.type === "approve_submission" ? "approved" : "rejected";
        this.log(`Submission ${submission.status} (${submission.wallet})`);
        return;
      }
      case "sim_reward": {
        const { bounty, submission } = this.submissionOf(await this.input(node, "submission"));
        if (submission.status === "rewarded") this.fail("That submission was already rewarded.");
        this.spend(bounty.reward, "SOL", "Reward");
        submission.status = "rewarded";
        this.log(`${sol(bounty.reward)} sent to ${submission.wallet}`, [], { simulated: true });
        return;
      }

      // ---- Output (always simulated) ----
      case "send_webhook": {
        const url = await this.text(node, "url");
        const payload = await this.input(node, "payload");
        this.log(`Webhook to ${url || "(no url)"}`, [`Payload ${this.display(payload)}`, "Not sent: outbound requests are simulated"], { simulated: true });
        return;
      }
      case "post_message": {
        const message = await this.text(node, "message");
        this.log(`Posted to ${String(node.dest)}: “${message}”`, [], { simulated: true });
        return;
      }
      case "send_email": {
        const subject = await this.text(node, "subject");
        await this.input(node, "body");
        this.log(`Email to ${this.field(node, "to") || "(nobody)"}: “${subject}”`, [], { simulated: true });
        return;
      }

      default:
        this.fail(`The ${labelOf(node)} block can't run yet.`);
    }
  }

  private async createAgent(node: IRNode): Promise<Agent> {
    const ai = this.ctx.adapters.ai;
    const id = this.newId("agent");
    const speciesList = listField(node.species);
    const species =
      node.speciesMode === "random_from_list"
        ? (this.rng.pick(speciesList) ?? "creature")
        : node.speciesMode === "free_text"
          ? this.field(node, "species") || "creature"
          : String((await ai.structured("Invent a species", ["species"])).species);

    const generated = node.nameMode === "ai_generated" || node.identityMode === "ai_generated" || node.personalityMode === "ai_generated"
      ? await ai.identity(species)
      : null;
    const name = node.nameMode === "manual" ? this.field(node, "name") || "Agent" : generated?.name || "Agent";
    const identity = node.identityMode === "custom" ? this.field(node, "identity") : (generated?.bio ?? "");
    const personality = node.personalityMode === "free_text" ? this.field(node, "personality") : (generated?.personality ?? "");
    const custom = await this.input(node, "custom");
    const visualText = this.field(node, "visual");
    const visual: Agent["visual"] =
      node.visualMode === "emoji"
        ? { mode: "emoji", value: visualText }
        : node.visualMode === "image_url"
          ? { mode: "image", value: visualText }
          : node.visualMode === "ai_generated_later"
            ? { mode: "pending", value: "" }
            : { mode: "placeholder", value: "" };

    return {
      id,
      name,
      identity,
      species,
      personality,
      visual,
      goal: this.field(node, "goal"),
      model: this.field(node, "model") || "default",
      memoryEnabled: node.memory !== false,
      memory: [],
      inventory: listField(node.inventory),
      budget: toNumber(node.budget as Value),
      score: toNumber(node.score as Value),
      tools: [],
      custom: isObject(custom) ? clone(custom) : {},
      inWorld: false,
      createdAt: this.now(),
      history: [{ at: this.now(), text: "Created" }],
    };
  }

  private setAgentProp(agent: Agent, prop: string, v: Value) {
    switch (prop.toLowerCase()) {
      case "name":
        agent.name = this.display(v);
        break;
      case "identity":
        agent.identity = this.display(v);
        break;
      case "species":
      case "type":
        agent.species = this.display(v);
        break;
      case "personality":
        agent.personality = this.display(v);
        break;
      case "goal":
        agent.goal = this.display(v);
        break;
      case "budget":
        agent.budget = toNumber(v);
        break;
      case "score":
        agent.score = toNumber(v);
        break;
      case "inventory":
        agent.inventory = toList(v);
        break;
      default:
        agent.custom[prop] = clone(v);
    }
  }

  private agentProp(agent: Agent, prop: string): Value {
    switch (prop.toLowerCase()) {
      case "id":
        return agent.id;
      case "name":
        return agent.name;
      case "identity":
        return agent.identity;
      case "species":
      case "type":
        return agent.species;
      case "personality":
        return agent.personality;
      case "goal":
        return agent.goal;
      case "model":
        return agent.model;
      case "budget":
        return agent.budget;
      case "score":
        return agent.score;
      case "inventory":
        return clone(agent.inventory);
      case "memory":
        return [...agent.memory];
      case "tools":
        return [...agent.tools];
      case "createdat":
        return agent.createdAt;
      default:
        return agent.custom[prop] ?? null;
    }
  }

  // -------------------------------------------------------------------------
  // Reporters
  // -------------------------------------------------------------------------

  private async reporter(node: IRNode): Promise<Value> {
    const s = this.state;
    const ai = this.ctx.adapters.ai;
    const web = this.ctx.adapters.web;
    const at = this.current;
    const note = (text: string, details: string[] = [], opts: Partial<ReceiptEntry> = {}) => this.log(text, details, opts, { ...node, id: node.id ?? at?.id });

    switch (node.type) {
      case "event_field": {
        const v = this.ctx.payload[String(node.field)];
        return v === undefined ? null : clone(v);
      }
      case "var": {
        const v = s.variables[String(node.var)];
        return v === undefined ? 0 : clone(v);
      }

      // ---- Logic ----
      case "compare": {
        const a = await this.input(node, "a");
        const b = await this.input(node, "b");
        switch (node.op) {
          case "eq":
            return equals(a, b);
          case "neq":
            return !equals(a, b);
          case "gt":
            return compareValues(a, b) > 0;
          case "lt":
            return compareValues(a, b) < 0;
          case "gte":
            return compareValues(a, b) >= 0;
          default:
            return compareValues(a, b) <= 0;
        }
      }
      case "contains": {
        const hay = await this.input(node, "haystack");
        const needle = await this.input(node, "needle");
        return Array.isArray(hay) ? hay.some((x) => equals(x, needle)) : this.display(hay).toLowerCase().includes(this.display(needle).toLowerCase());
      }
      case "logic_op": {
        const a = truthy(await this.input(node, "a"));
        if (node.op === "and" && !a) return false;
        if (node.op === "or" && a) return true;
        return truthy(await this.input(node, "b"));
      }
      case "not":
        return !truthy(await this.input(node, "value"));
      case "exists": {
        // A variable that was never set doesn't exist (even though it reads as 0).
        const target = node.value as Expr | null | undefined;
        if (target && typeof target === "object" && !Array.isArray(target) && target.type === "var" && !(String(target.var) in s.variables))
          return false;
        const v = await this.input(node, "value");
        if (isRef(v, "agent")) return s.agents.some((a) => a.id === v.id);
        if (isRef(v, "entity")) return s.entities.some((e) => e.id === v.id);
        return v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
      }
      case "chance": {
        const percent = await this.num(node, "percent");
        const hit = this.rng.next() * 100 < percent;
        note(`${fmt(percent)}% chance: ${hit ? "yes" : "no"}`);
        return hit;
      }
      case "wallet_owns": {
        const wallet = await this.text(node, "wallet");
        const token = await this.text(node, "token");
        return hash(`${wallet}:${token}`) % 2 === 0;
      }

      // ---- Data ----
      case "object":
        return isObject(node.pairs) ? clone(node.pairs as Record<string, Value>) : {};
      case "timestamp":
        return this.now();
      case "arithmetic": {
        const a = await this.num(node, "a");
        const b = await this.num(node, "b");
        switch (node.op) {
          case "add":
            return round(a + b);
          case "sub":
            return round(a - b);
          case "mul":
            return round(a * b);
          default:
            if (b === 0) this.fail("Can't divide by zero.");
            return round(a / b);
        }
      }
      case "percentage":
        return round(((await this.num(node, "percent")) / 100) * (await this.num(node, "value")));
      case "min_max": {
        const a = await this.num(node, "a");
        const b = await this.num(node, "b");
        return node.op === "max" ? Math.max(a, b) : Math.min(a, b);
      }
      case "random_number": {
        let lo = await this.num(node, "min");
        let hi = await this.num(node, "max");
        if (lo > hi) [lo, hi] = [hi, lo];
        const n = Number.isInteger(lo) && Number.isInteger(hi) ? this.rng.int(lo, hi) : this.rng.range(lo, hi);
        note(`Random number ${fmt(n)}`);
        return n;
      }
      case "random_item": {
        const list = toList(await this.input(node, "list"));
        const item = this.rng.pick(list) ?? null;
        note(`Random item ${this.display(item)}`);
        return item;
      }
      case "list_length":
        return toList(await this.input(node, "list")).length;
      case "list_item": {
        const i = Math.floor(await this.num(node, "index"));
        const list = toList(await this.input(node, "list"));
        return list[i - 1] ?? null;
      }
      case "get_key": {
        const obj = this.view(await this.input(node, "object"));
        const key = this.field(node, "key");
        return isObject(obj) ? (obj[key] ?? null) : null;
      }
      case "join":
        return (await this.text(node, "a")) + (await this.text(node, "b"));

      // ---- Agents ----
      case "agent_get":
        return this.agentProp(this.agentOf(await this.input(node, "agent")), this.field(node, "prop"));
      case "random_agent": {
        const a = this.rng.pick(s.agents);
        note(a ? `Random agent ${a.name}` : "Random agent: none exist yet");
        if (a) this.focusAgent = a.id;
        return a ? ref("agent", a.id) : null;
      }
      case "all_agents":
        return s.agents.map((a) => ref("agent", a.id));

      // ---- AI ----
      case "ai_ask": {
        const prompt = await this.text(node, "prompt");
        const answer = await ai.ask(prompt);
        note(`AI answered`, [`Prompt: ${prompt}`, answer, `AI: ${ai.label}`]);
        return answer;
      }
      case "ai_structured": {
        const prompt = await this.text(node, "prompt");
        const out = await ai.structured(prompt, listField(node.fields));
        note(`AI structured output`, [this.display(out), `AI: ${ai.label}`]);
        return out;
      }
      case "ai_choose": {
        const options = toList(await this.input(node, "options"));
        const criteria = await this.text(node, "criteria");
        const { index, reason } = await ai.choose(options, criteria, (v) => this.display(v));
        const choice = options[index] ?? null;
        note(`AI chose ${this.display(choice)}`, [reason, `AI: ${ai.label}`]);
        return choice;
      }
      case "ai_classify": {
        const text = await this.text(node, "text");
        const label = await ai.classify(text, listField(node.labels));
        note(`AI classified as ${label}`, [`AI: ${ai.label}`]);
        return label;
      }
      case "ai_summarize": {
        const summary = await ai.summarize(await this.text(node, "text"));
        note(`AI summary`, [summary, `AI: ${ai.label}`]);
        return summary;
      }
      case "ai_identity": {
        const id = await ai.identity(await this.text(node, "subject"));
        note(`AI identity: ${id.name}`, [id.personality, `AI: ${ai.label}`]);
        return { ...id };
      }
      case "ai_decision": {
        const question = await this.text(node, "question");
        const yes = await ai.decide(question);
        note(`AI decided ${yes ? "yes" : "no"}`, [question, `AI: ${ai.label}`]);
        return yes;
      }

      // ---- Web ----
      case "web_search": {
        const query = await this.text(node, "query");
        const results = await web.search(query);
        note(`Searched “${query}”`, [`${results.length} results`, `Web: ${web.label}`]);
        return results.map((r) => ({ ...r }));
      }
      case "web_open": {
        const target = await this.input(node, "url");
        const url = isObject(target) && typeof target.url === "string" ? target.url : this.display(target);
        const page = await web.open(url);
        note(`Opened ${page.url}`, [`Web: ${web.label}`]);
        return { ...page };
      }
      case "web_extract": {
        const page = await this.input(node, "page");
        return isObject(page) ? this.display(page.text ?? "") : this.display(page);
      }
      case "web_follow": {
        const i = Math.floor(await this.num(node, "index"));
        const page = await this.input(node, "page");
        const links = isObject(page) ? toList(page.links ?? []) : [];
        const link = links[i - 1];
        if (link === undefined) this.fail(`That page has no link #${i}.`);
        const next = await web.open(this.display(link));
        note(`Followed link #${i} → ${next.url}`, [`Web: ${web.label}`]);
        return { ...next };
      }
      case "http_request": {
        const url = await this.text(node, "url");
        const method = String(node.method);
        note(`${method} ${url || "(no url)"}`, ["Not sent: HTTP is off in the prototype"], { simulated: true });
        return { status: 200, simulated: true, body: "" };
      }

      // ---- Media ----
      case "generate_image": {
        const prompt = await this.text(node, "prompt");
        const style = String(node.style);
        note(`Image generated (${style.replace("_", " ")})`, [prompt, "Placeholder image in the prototype"]);
        return `placeholder:${style}:${prompt}`;
      }
      case "generate_text": {
        const text = await ai.generateText(String(node.kind), await this.text(node, "topic"));
        note(`Generated ${String(node.kind).replace("_", " ")}`, [text, `AI: ${ai.label}`]);
        return text;
      }
      case "choose_image": {
        const img = this.rng.pick(toList(await this.input(node, "images"))) ?? null;
        note(`Chose image ${this.display(img)}`);
        return img;
      }

      // ---- Finance ----
      case "wallet_balance": {
        const wallet = await this.text(node, "wallet");
        if (!wallet || wallet.toLowerCase() === "treasury") return s.treasury.SOL;
        const chain = this.ctx.adapters.chain;
        const sol = await chain.balance(wallet);
        note(`Balance of ${wallet.length > 12 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet}: ${sol === null ? "unavailable" : `${fmt(sol)} SOL`}`, [`Chain: ${chain.label}`]);
        return sol ?? 0;
      }
      case "treasury":
        return node.asset === "USDC" ? s.treasury.USDC : s.treasury.SOL;
      case "budget":
        return s.budgets[this.field(node, "name")] ?? 0;
      case "budget_check":
        return (s.budgets[this.field(node, "name")] ?? 0) >= (await this.num(node, "amount"));

      // ---- Bounties ----
      case "get_submission": {
        const bounty = this.bountyOf(await this.input(node, "bounty"));
        const pool = bounty.submissions;
        const sub =
          node.which === "best_scored"
            ? [...pool].filter((x) => x.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
            : pool[pool.length - 1];
        if (!sub) this.fail(`“${bounty.title}” has no submissions yet.`);
        return ref("submission", sub.id);
      }
      case "ai_review": {
        const { submission } = this.submissionOf(await this.input(node, "submission"));
        const criteria = await this.text(node, "criteria");
        const review = await ai.review(submission.content, criteria);
        submission.score = review.score;
        submission.feedback = review.feedback;
        note(`AI review: ${review.score}/100`, [review.feedback, `AI: ${ai.label}`]);
        return { score: review.score, feedback: review.feedback };
      }

      default:
        this.fail(`The ${labelOf(node)} block can't be evaluated.`);
    }
  }

  async *run(script: Script): AsyncGenerator<Trace, RunResult> {
    const result = (status: RunStatus, error: string | null = null, extra: Partial<RunResult> = {}): RunResult => ({
      status,
      error,
      stopAll: false,
      steps: this.steps,
      focusAgent: this.focusAgent,
      ...extra,
    });
    try {
      yield* this.block(script.body);
      return result("complete");
    } catch (e) {
      if (e instanceof StopSignal) return result("stopped", null, { stopAll: e.all });
      if (e instanceof StepLimit) {
        const msg = `Stopped after ${this.ctx.maxSteps ?? MAX_STEPS} steps. Is there a loop that never ends?`;
        this.log(msg, [], { status: "error" });
        return result("step_limit", msg, { errorBlockId: this.current?.id });
      }
      const msg = e instanceof Error ? e.message : String(e);
      const blockId = e instanceof RuntimeError ? e.nodeId : this.current?.id;
      this.log(msg, [], { status: "error" });
      return result("error", msg, { errorBlockId: blockId });
    }
  }
}

/**
 * Runs one script against `ctx.state`. Yields before each statement; returns
 * how it ended. The caller decides pacing (and may stop iterating to abort).
 */
export function runScript(script: Script, ctx: RunContext): AsyncGenerator<Trace, RunResult> {
  return new Interpreter(ctx).run(script);
}

/** Runs a script to completion with no pacing (tests, headless use). */
export async function runToEnd(script: Script, ctx: RunContext): Promise<RunResult> {
  const gen = runScript(script, ctx);
  for (;;) {
    const r = await gen.next();
    if (r.done) return r.value;
  }
}
