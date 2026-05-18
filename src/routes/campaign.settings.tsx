import { createFileRoute, Link } from "@tanstack/react-router";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { toastSaved } from "@/lib/saved";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/campaign/settings")({ component: Settings });

const COLORS = ["#a78bfa","#60a5fa","#34d399","#f472b6","#fbbf24","#fb7185","#22d3ee","#84cc16","#f97316","#e879f9"];

function Settings() {
  const { character, campaign, loading } = useGameData();
  const { t } = useT();
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (character) setForm({ ...character }); }, [character?.id]);

  if (loading || !character || !campaign || !form) return <PageFrame><p className="text-muted-foreground text-center">{t("settingsPage.loading")}</p></PageFrame>;

  async function save() {
    const changes: string[] = [];
    (["fue","des","con","int_stat","wis","car","velocity","initiative","base_hp","base_defense","damage_boost"] as const).forEach(k => {
      if ((character as any)[k] !== form[k]) changes.push(`${k}:${(character as any)[k]}→${form[k]}`);
    });
    await supabase.from("characters").update({
      race: form.race, class: form.class, color: form.color,
      fue: +form.fue, des: +form.des, con: +form.con, int_stat: +form.int_stat, wis: +form.wis, car: +form.car,
      velocity: +form.velocity, initiative: +form.initiative,
      base_hp: +form.base_hp, base_defense: +form.base_defense,
      damage_boost: Math.max(0, +form.damage_boost || 0),
    } as any).eq("id", character!.id);
    if (changes.length) {
      await pushLog(campaign!.id, [
        { t: "char", v: character!.name, color: character!.color },
        { t: "text", v: t("settingsPage.editedStatsLog", { changes: changes.join(", ") }) },
      ]);
    }
    toastSaved();
  }

  const num = (k: string, label: string) => (
    <label className="stat-pill gap-1 min-w-0 !items-center">
      <span className="min-w-0 flex-1 whitespace-normal break-words leading-tight text-[10px]">{label}</span>
      <input type="number" className="w-14 flex-shrink-0 bg-transparent text-right outline-none text-[var(--gold)]"
        value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
    </label>
  );

  const nameLocked = !!(campaign as any).lock_character_names && character.role !== "dm";

  async function saveName() {
    const next = (form.name || "").trim();
    if (!next || next === character!.name) return;
    if (nameLocked) { toast.error(t("settingsPage.nameLockedToast")); return; }
    const prev = { name: character!.name };
    await supabase.from("characters").update({ name: next }).eq("id", character!.id);
    await pushLog(campaign!.id, [
      { t: "char", v: prev.name, color: character!.color, id: character!.id },
      { t: "text", v: t("settingsPage.nameChangedTo") },
      { t: "char", v: next, color: character!.color, id: character!.id },
    ], { kind: "character.update", id: character!.id, prev });
    toastSaved();
  }

  return (
    <PageFrame title={t("settingsPage.title")} subtitle={character.name} right={<Link to="/campaign/profile" className="text-muted-foreground"><ArrowLeft size={20}/></Link>}>
      <div className="ornate-card p-4 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t("settingsPage.identity")}</p>
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-[10px] text-muted-foreground">{t("settingsPage.nameLabel")}</span>
              <input
                className="w-full rounded bg-input border border-border px-3 py-2 text-sm disabled:opacity-60"
                placeholder={t("settingsPage.namePlaceholder")}
                value={form.name || ""}
                disabled={nameLocked}
                onChange={e => setForm({ ...form, name: e.target.value })}
                onBlur={saveName}
              />
              {nameLocked && <span className="block text-[10px] text-muted-foreground">{t("settingsPage.nameLockedHint")}</span>}
            </label>
            <input className="w-full rounded bg-input border border-border px-3 py-2 text-sm" placeholder={t("settingsPage.race")} value={form.race} onChange={e => setForm({...form, race: e.target.value})} />
            <input className="w-full rounded bg-input border border-border px-3 py-2 text-sm" placeholder={t("settingsPage.class")} value={form.class} onChange={e => setForm({...form, class: e.target.value})} />
          </div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-3 mb-2">{t("settingsPage.nameColor")}</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => setForm({...form, color: c})}
                className="w-8 h-8 rounded-full border-2"
                style={{ background: c, borderColor: form.color === c ? "var(--gold)" : "transparent" }} />
            ))}
          </div>
        </div>
        <div className="gem-divider"/>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t("settingsPage.baseAttrs")}</p>
          <div className="grid grid-cols-2 gap-2">
            {num("fue","FUE")}{num("des","DES")}{num("con","CON")}
            {num("int_stat","INT")}{num("wis","SAB")}{num("car","CAR")}
          </div>
        </div>
        <div className="gem-divider"/>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{t("settingsPage.baseCombat")}</p>
          <div className="grid grid-cols-2 gap-2">
            {num("base_hp", t("settingsPage.baseHp"))}
            {num("base_defense", t("settingsPage.baseDefense"))}
            {num("velocity", t("settingsPage.velocity"))}
            {num("initiative", t("settingsPage.initiative"))}
            {num("damage_boost", t("settingsPage.damageBoost"))}
          </div>
        </div>
        <button className="btn-fantasy w-full" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={save}>{t("settingsPage.save")}</button>
      </div>
    </PageFrame>
  );
}
