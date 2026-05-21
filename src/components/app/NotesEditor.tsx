import { useEffect, useRef, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import {
  Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Quote,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Eraser,
} from "lucide-react";
import { useT } from "@/lib/i18n";

type Props = {
  characterId: string;
  characterName: string;
  characterColor?: string;
  readOnly?: boolean;
  onClose: () => void;
};

const COLORS = ["#e8e0c8", "#f5d76e", "#e74c3c", "#5dade2", "#58d68d", "#bb8fce", "#f1948a", "#ffffff"];

const STAT_COLORS: Record<string, string> = {
  FUE: "var(--stat-fue)", DES: "var(--stat-des)", CON: "var(--stat-con)",
  INT: "var(--stat-int)", SAB: "var(--stat-sab)", CAR: "var(--stat-car)",
  STR: "var(--stat-fue)", DEX: "var(--stat-des)", WIS: "var(--stat-sab)", CHA: "var(--stat-car)",
};
const STAT_RE = /\b(FUE|DES|CON|INT|SAB|CAR|STR|DEX|WIS|CHA)\b/g;

/** Wrap stat tokens (FUE, DES, ...) inside text nodes of `root` with colored spans. Idempotent. */
function highlightStats(root: HTMLElement | null) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.dataset?.stat) return NodeFilter.FILTER_REJECT;
      return STAT_RE.test(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) targets.push(n as Text);
  for (const text of targets) {
    const value = text.nodeValue || "";
    STAT_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = STAT_RE.exec(value)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(value.slice(last, m.index)));
      const span = document.createElement("span");
      span.dataset.stat = m[1];
      span.style.color = STAT_COLORS[m[1]];
      span.style.fontWeight = "600";
      span.textContent = m[1];
      frag.appendChild(span);
      last = m.index + m[1].length;
    }
    if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)));
    text.replaceWith(frag);
  }
}

export function NotesEditor({ characterId, characterName, characterColor, readOnly, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initialRef = useRef<string>("");
  const { t } = useT();

  const FONTS = [
    { label: t("notes.fontDefault"), value: "" },
    { label: t("notes.fontSerif"), value: "Georgia, 'Times New Roman', serif" },
    { label: t("notes.fontSans"), value: "system-ui, -apple-system, sans-serif" },
    { label: t("notes.fontMono"), value: "ui-monospace, SFMono-Regular, monospace" },
    { label: t("notes.fontCursive"), value: "'Brush Script MT', cursive" },
  ];
  const SIZES = [
    { label: t("notes.sizeSmall"), value: "2" },
    { label: t("notes.sizeNormal"), value: "3" },
    { label: t("notes.sizeLarge"), value: "5" },
    { label: t("notes.sizeHuge"), value: "6" },
  ];

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await (supabase as any).from("character_notes")
        .select("content").eq("character_id", characterId).maybeSingle();
      if (cancel) return;
      const raw = (data?.content as string) || "";
      const html = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
      initialRef.current = html;
      if (ref.current) { ref.current.innerHTML = html; highlightStats(ref.current); }
      setLoading(false);
    })();

    return () => { cancel = true; };
  }, [characterId]);

  function exec(cmd: string, val?: string) {
    if (readOnly) return;
    ref.current?.focus();
    try { document.execCommand(cmd, false, val); } catch { /* ignore */ }
    setDirty(true);
  }

  async function save() {
    if (!ref.current) return;
    setSaving(true);
    const content = DOMPurify.sanitize(ref.current.innerHTML, { USE_PROFILES: { html: true } });
    const { error } = await (supabase as any).from("character_notes")
      .upsert({ character_id: characterId, content, updated_at: new Date().toISOString() });

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    initialRef.current = content;
    setDirty(false);
    toast.success(t("notes.saved"));
  }

  function tryClose() {
    if (dirty && !readOnly) {
      if (!confirm(t("notes.discardConfirm"))) return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[80] flex items-center justify-center p-2" onClick={tryClose}>
      <div className="ornate-card w-full max-w-2xl max-h-[94vh] flex flex-col p-3 sm:p-4 gap-2"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("notes.title")}</p>
            <h3 className="font-display text-lg truncate" style={{ color: characterColor || "var(--gold)" }}>
              📝 {characterName} {readOnly && <span className="text-xs text-muted-foreground">{t("notes.readonly")}</span>}
            </h3>
          </div>
          <button className="text-muted-foreground hover:text-foreground text-sm" onClick={tryClose}>✕</button>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-md border border-border bg-secondary/40">
            <ToolBtn onClick={() => exec("bold")} title={t("notes.tBold")}><Bold size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("italic")} title={t("notes.tItalic")}><Italic size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("underline")} title={t("notes.tUnderline")}><Underline size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("strikeThrough")} title={t("notes.tStrike")}><Strikethrough size={14}/></ToolBtn>
            <Sep/>
            <ToolBtn onClick={() => exec("formatBlock", "<h2>")} title={t("notes.tH1")}><Heading1 size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("formatBlock", "<h3>")} title={t("notes.tH2")}><Heading2 size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("formatBlock", "<blockquote>")} title={t("notes.tQuote")}><Quote size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("formatBlock", "<p>")} title={t("notes.tParagraph")}>P</ToolBtn>
            <Sep/>
            <ToolBtn onClick={() => exec("insertUnorderedList")} title={t("notes.tList")}><List size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("insertOrderedList")} title={t("notes.tOrdered")}><ListOrdered size={14}/></ToolBtn>
            <Sep/>
            <ToolBtn onClick={() => exec("justifyLeft")} title={t("notes.tLeft")}><AlignLeft size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("justifyCenter")} title={t("notes.tCenter")}><AlignCenter size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("justifyRight")} title={t("notes.tRight")}><AlignRight size={14}/></ToolBtn>
            <Sep/>
            <select className="bg-input border border-border rounded px-1 py-0.5 text-[11px]"
              defaultValue="" onChange={e => { exec("fontName", e.target.value); e.currentTarget.value = ""; }}>
              <option value="" disabled>{t("notes.font")}</option>
              {FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>
            <select className="bg-input border border-border rounded px-1 py-0.5 text-[11px]"
              defaultValue="" onChange={e => { exec("fontSize", e.target.value); e.currentTarget.value = ""; }}>
              <option value="" disabled>{t("notes.size")}</option>
              {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <Sep/>
            {COLORS.map(c => (
              <button key={c} title={`Color ${c}`} onClick={() => exec("foreColor", c)}
                className="w-5 h-5 rounded-full border border-border hover:scale-110 transition"
                style={{ background: c }} />
            ))}
            <Sep/>
            <ToolBtn onClick={() => exec("undo")} title={t("notes.tUndo")}><Undo2 size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("redo")} title={t("notes.tRedo")}><Redo2 size={14}/></ToolBtn>
            <ToolBtn onClick={() => exec("removeFormat")} title={t("notes.tClear")}><Eraser size={14}/></ToolBtn>
          </div>
        )}

        <div
          ref={ref}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={() => setDirty(true)}
          onBlur={() => highlightStats(ref.current)}
          className="flex-1 overflow-y-auto rounded-md border border-border bg-input p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--gold)] notes-editor"
          style={{ minHeight: "40vh" }}
        />
        {loading && <p className="text-xs text-muted-foreground text-center">{t("notes.loading")}</p>}

        <div className="flex gap-2">
          <button className="btn-fantasy flex-1" onClick={tryClose}>{t("common.close")}</button>
          {!readOnly && (
            <button className="btn-fantasy flex-1" disabled={saving || !dirty}
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)", opacity: !dirty ? 0.6 : 1 }}
              onClick={save}>
              {saving ? t("notes.saving") : t("notes.save")}
            </button>
          )}
        </div>

        <style>{`
          .notes-editor h2 { font-size: 1.25rem; font-weight: 700; margin: 0.4em 0; color: var(--gold); }
          .notes-editor h3 { font-size: 1.05rem; font-weight: 600; margin: 0.35em 0; color: var(--gold); }
          .notes-editor blockquote { border-left: 3px solid var(--gold); padding-left: 0.75rem; margin: 0.5em 0; opacity: 0.85; font-style: italic; }
          .notes-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0.4em 0; }
          .notes-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0.4em 0; }
          .notes-editor p { margin: 0.3em 0; }
          .notes-editor:empty:before { content: "${t("notes.placeholder")}"; color: var(--muted-foreground); }
        `}</style>
      </div>
    </div>
  );
}

function ToolBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick} title={title}
      className="px-1.5 py-1 rounded hover:bg-secondary border border-transparent hover:border-border text-xs flex items-center justify-center min-w-[26px]">
      {children}
    </button>
  );
}
function Sep() { return <span className="w-px h-5 bg-border mx-0.5" />; }
