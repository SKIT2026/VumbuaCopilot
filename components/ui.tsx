"use client";
import { useState } from "react";
import type { HypothesisStatus } from "@/lib/types";
import { STATUS_HELP } from "@/lib/types";

export function StatusBadge({ status, title }: { status: HypothesisStatus; title?: string }) {
  return (
    <span className={`badge st-${status.replace(/ /g, "-")}`} title={title || STATUS_HELP[status]}>
      {status}
    </span>
  );
}

/** Editable list of short strings (segments, problems, alternatives...) */
export function ListEditor({
  label, items, onChange, placeholder, disabled,
}: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean }) {
  const [v, setV] = useState("");
  const id = "le-" + label.replace(/\W/g, "");
  const add = () => { if (v.trim()) { onChange([...items, v.trim()]); setV(""); } };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <ul className="list-edit">
        {items.map((it, i) => (
          <li key={i}>
            <span>{it}</span>
            <button className="btn-sm btn-ghost" disabled={disabled} aria-label={`Remove ${it}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
          </li>
        ))}
        {items.length === 0 && <li><small>None yet</small></li>}
      </ul>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input id={id} value={v} placeholder={placeholder} disabled={disabled}
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button className="btn-sm" onClick={add} disabled={disabled || !v.trim()}>Add</button>
      </div>
    </div>
  );
}

export function AIGuidance({ children }: { children: React.ReactNode }) {
  return (
    <div className="ai-note" role="note">
      <strong>AI guidance, not verified fact. </strong>{children}
    </div>
  );
}

export function download(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
