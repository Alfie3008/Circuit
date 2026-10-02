"use client";

import { useState } from "react";

type Kind = "event" | "value" | "action";
interface Member {
  kind: Kind;
  name: string;
}

const KIND_LABEL: Record<Kind, string> = { event: "EVENT", value: "VALUE", action: "ACTION" };
const slug = (s: string) => s.trim().replace(/\s+(\w)/g, (_, c: string) => c.toUpperCase()).replace(/[^\w]/g, "");

/**
 * The shape a third-party module will take. Nothing here executes: custom
 * modules can't run code yet. It shows the manifest a module would publish.
 */
export function CreateModuleDemo() {
  const [name, setName] = useState("Minecraft");
  const [description, setDescription] = useState("Mirror the project world inside a Minecraft server.");
  const [members, setMembers] = useState<Member[]>([
    { kind: "event", name: "player joined" },
    { kind: "value", name: "online players" },
    { kind: "action", name: "spawn entity" },
  ]);

  const manifest = {
    module: slug(name).toLowerCase() || "module",
    name,
    description,
    events: members.filter((m) => m.kind === "event" && m.name.trim()).map((m) => slug(m.name)),
    values: members.filter((m) => m.kind === "value" && m.name.trim()).map((m) => slug(m.name)),
    actions: members.filter((m) => m.kind === "action" && m.name.trim()).map((m) => slug(m.name)),
  };

  const input = "h-8 rounded-md border border-line-2 bg-canvas px-2.5 font-mono text-[12.5px] text-fg focus:border-signal/60 focus:outline-none";

  return (
    <section className="mt-10 rounded-[14px] border border-dashed border-[#2f3237] p-5">
      <p className="font-mono text-[11px] tracking-[0.14em] text-dim">DEVELOPER PREVIEW</p>
      <h2 className="mt-1 text-[20px] font-medium tracking-[-0.02em]">Create a module</h2>
      <p className="mt-1.5 max-w-[620px] text-[13.5px] text-fg-2">
        A module declares what it adds; its adapter implements it on the server. This preview builds the manifest only. Custom modules
        can&apos;t run code yet.
      </p>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 max-[820px]:grid-cols-1">
        <div className="flex flex-col gap-3">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} aria-label="Module name" placeholder="Name" />
          <input className={input} value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" placeholder="Description" />
          {members.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-[62px] shrink-0 font-mono text-[10.5px] tracking-[0.1em] text-dim">{KIND_LABEL[m.kind]}</span>
              <input
                className={`${input} min-w-0 flex-1`}
                value={m.name}
                aria-label={`${KIND_LABEL[m.kind]} name`}
                onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <button onClick={() => setMembers(members.filter((_, j) => j !== i))} aria-label="Remove" className="px-1 text-dim hover:text-err">
                ×
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            {(["event", "value", "action"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setMembers([...members, { kind: k, name: "" }])}
                className="rounded-md border border-line-2 px-2.5 py-1 font-mono text-[11.5px] text-fg-2 hover:border-signal/50 hover:text-fg"
              >
                + {k}
              </button>
            ))}
          </div>
        </div>
        <pre className="overflow-auto rounded-lg border border-line-2 bg-canvas p-4 font-mono text-[12px] leading-relaxed text-fg-2">
          {JSON.stringify(manifest, null, 2)}
        </pre>
      </div>
    </section>
  );
}
