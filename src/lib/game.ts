import type { Database } from "@/integrations/supabase/types";

export type Rarity = "white" | "blue" | "purple" | "gold";
export type Slot =
  | "casco" | "pecho" | "pantalon" | "botas" | "cinturon"
  | "accesorio1" | "accesorio2" | "mochila" | "arma_principal"
  | "arma_secundaria" | "guantes" | "aditamento";
export type Role = "dm" | "player" | "spectator";

export type AppUser = { id: string; username: string; pin: string; created_at: string };
export type CampaignMember = { id: string; campaign_id: string; user_id: string; role: Role; created_at: string };

export type Character = Database["public"]["Tables"]["characters"]["Row"];
export type Item = Database["public"]["Tables"]["items"]["Row"];
export type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
export type Achievement = Database["public"]["Tables"]["achievements"]["Row"];
export type LogRow = Database["public"]["Tables"]["logs"]["Row"];

export const SLOTS: { key: Slot; label: string; icon: string }[] = [
  { key: "casco", label: "Casco", icon: "⛑️" },
  { key: "accesorio1", label: "Accesorio 1", icon: "💍" },
  { key: "pecho", label: "Pecho", icon: "🛡️" },
  { key: "accesorio2", label: "Accesorio 2", icon: "📿" },
  { key: "mochila", label: "Mochila", icon: "🎒" },
  { key: "arma_principal", label: "Arma principal", icon: "⚔️" },
  { key: "pantalon", label: "Pantalón", icon: "👖" },
  { key: "arma_secundaria", label: "Arma secundaria", icon: "🗡️" },
  { key: "guantes", label: "Guantes", icon: "🧤" },
  { key: "botas", label: "Botas", icon: "🥾" },
  { key: "cinturon", label: "Cinturón", icon: "🎗️" },
  { key: "aditamento", label: "Aditamento", icon: "🎵" },
];

export const RARITY_BONUS: Record<Rarity, { def: number; hp: number }> = {
  white:  { def: 1, hp: 4 },
  blue:   { def: 2, hp: 8 },
  purple: { def: 3, hp: 15 },
  gold:   { def: 4, hp: 25 },
};

export const RARITY_COLOR: Record<Rarity, string> = {
  white: "var(--rarity-white)",
  blue: "var(--rarity-blue)",
  purple: "var(--rarity-purple)",
  gold: "var(--rarity-gold)",
};

export const RARITY_LABEL: Record<Rarity, string> = {
  white: "Común",
  blue: "Rara",
  purple: "Épica",
  gold: "Legendaria",
};

/** Rarity name as used in user-facing booster files (Spanish color names). */
export const RARITY_NAME_ES: Record<Rarity, string> = {
  white: "Blanca",
  blue: "Azul",
  purple: "Morada",
  gold: "Dorada",
};

/** Bonus a sumar a "Dados a tirar" según la rareza del potenciador. */
export const RARITY_DICE_BONUS: Record<Rarity, number> = {
  white: 3,
  blue: 4,
  purple: 5,
  gold: 6,
};

export function modifier(score: number) {
  return Math.floor((score - 10) / 2);
}

export function fmtMod(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function isWeapon(slot: Slot) {
  return slot === "arma_principal" || slot === "arma_secundaria";
}

export type ItemCategory =
  | "equipo" | "consumible" | "material" | "herramienta"
  | "tela" | "comida" | "libro" | "llave" | "tesoro" | "otro";

export const ITEM_CATEGORIES: { key: ItemCategory; label: string; icon: string }[] = [
  { key: "equipo",      label: "Equipo",      icon: "⚔️" },
  { key: "consumible",  label: "Consumible",  icon: "🧪" },
  { key: "material",    label: "Material",    icon: "🪵" },
  { key: "herramienta", label: "Herramienta", icon: "🔧" },
  { key: "tela",        label: "Tela/Venda",  icon: "🩹" },
  { key: "comida",      label: "Comida",      icon: "🍞" },
  { key: "libro",       label: "Libro/Pergamino", icon: "📜" },
  { key: "llave",       label: "Llave",       icon: "🗝️" },
  { key: "tesoro",      label: "Tesoro",      icon: "💎" },
  { key: "otro",        label: "Otro",        icon: "📦" },
];

export function totals(character: Character, equipped: Item[]) {
  let defBonus = 0, hpBonus = 0, dmgBonus = 0;
  let hasWeapon = false;
  for (const it of equipped) {
    if (isWeapon(it.slot as Slot)) {
      dmgBonus += it.damage_bonus;
      hasWeapon = true;
    } else {
      defBonus += it.defense_bonus || RARITY_BONUS[it.rarity as Rarity].def;
      hpBonus  += it.hp_bonus     || RARITY_BONUS[it.rarity as Rarity].hp;
    }
  }
  const boost = Math.max(0, ((character as any).damage_boost as number) || 0);
  const damage = hasWeapon ? dmgBonus + boost : (boost > 0 ? boost : 0);
  return {
    defense: character.base_defense + defBonus,
    maxHp: character.base_hp + hpBonus,
    damage,
  };
}

/* ----- Log segments ----- */
export type Segment =
  | { t: "text"; v: string }
  | { t: "char"; v: string; color: string; id?: string }
  | { t: "item"; v: string; rarity: Rarity; id?: string; kind?: "item" | "booster" }
  | { t: "coins"; v: string }
  | { t: "gain"; v: string }
  | { t: "loss"; v: string };

export const SESSION_KEY = "codice.session";
export type Session = {
  userId: string;
  username: string;
  campaignId: string;
  characterId: string | null;
  role: Role;
  isMaster?: boolean;
};
export const USER_KEY = "codice.user";
export type StoredUser = { id: string; username: string };
export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
}
export function setStoredUser(u: StoredUser | null) {
  if (typeof window === "undefined") return;
  if (!u) localStorage.removeItem(USER_KEY);
  else localStorage.setItem(USER_KEY, JSON.stringify(u));
}
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}
export function setSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (!s) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}