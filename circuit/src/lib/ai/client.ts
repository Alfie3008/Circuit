/**
 * Browser side of the AI routes: status, the optional access password and
 * a fetch helper. Never sees the API key (that stays on the server).
 */

export interface AiStatus {
  enabled: boolean;
  compileModel: string;
  runtimeModel: string;
  passwordRequired: boolean;
}

const PASSWORD_KEY = "circuit:ai-password";

function getPassword(): string {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? "";
  } catch {
    return "";
  }
}

function setPassword(value: string) {
  try {
    localStorage.setItem(PASSWORD_KEY, value);
  } catch {
    // storage unavailable: asked again next time
  }
}

export async function fetchAiStatus(): Promise<AiStatus | null> {
  try {
    const res = await fetch("/api/ai", { cache: "no-store" });
    return res.ok ? ((await res.json()) as AiStatus) : null;
  } catch {
    return null;
  }
}

/**
 * POSTs JSON to an AI route with the stored password. When `interactive`, a
 * 401 asks for the password once and retries.
 */
export async function aiPost(url: string, body: unknown, interactive = false): Promise<Response> {
  const send = () =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-circuit-password": getPassword() },
      body: JSON.stringify(body),
    });
  let res = await send();
  if (res.status === 401 && interactive) {
    const entered = window.prompt("This CIRCUIT needs a password for AI features:");
    if (entered) {
      setPassword(entered);
      res = await send();
    }
  }
  return res;
}

/** GET with the stored password (chain routes share the AI routes' guard). */
export function guardedGet(url: string): Promise<Response> {
  return fetch(url, { headers: { "x-circuit-password": getPassword() }, cache: "no-store" });
}

/** Error text from an AI route response. */
export async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
