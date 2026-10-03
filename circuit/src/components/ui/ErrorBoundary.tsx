"use client";

import { Component, type ReactNode } from "react";

/**
 * Failsafe for the UI: if one panel hits a problem while drawing, only that
 * panel shows a message (with a way to try again). The rest of the page, and
 * the user's blocks, keep working.
 */
export class ErrorBoundary extends Component<{ name: string; children: ReactNode; className?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[circuit] ${this.props.name} failed to draw`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className={`flex flex-col items-start gap-2 p-4 text-[13px] text-fg-2 ${this.props.className ?? ""}`}>
        <span>
          The {this.props.name} hit a problem and stopped drawing. Your blocks and project are safe.
        </span>
        <button onClick={() => this.setState({ error: null })} className="h-7 rounded-md border border-line-2 px-2.5 font-mono text-[11.5px] text-fg hover:bg-raised">
          Try again
        </button>
      </div>
    );
  }
}
