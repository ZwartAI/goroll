// Enemy / Monster Excel importer.
// IMPORTANT: We parse in-memory only. The original file is NEVER persisted
// (no storage upload, no base64 backup). After import the File reference is dropped.
import * as XLSX from "xlsx";
import {
  BIOME_PRESETS, TIER_VISUALS, getTierVisual, pickAutoIcon,
  TIER_OPTIONS, ROLE_OPTIONS, isPresetBiome,
  type EnemyTier, type EnemyRole,
} from "./bestiary";

export type ImportedEnemySkill = {
  name: string;
  rarity: "white" | "green" | "blue" | "purple" | "orange" | "red";
  skill_type: string | null;
  target_shape: string | null;
  targets: string | null;
  dice: string | null;
  range_text: string | null;
  effect: string | null;
  visual_brief: string | null;
  order_index: number;
};

export type ImportedEnemy = {
  /** Stable key from the sheet (enemy_key column) — used to join skills. */
  key: string;
  name: string;
  tier: EnemyTier;
  /** True when the source row had no recognizable tier. */
  tierMissing: boolean;
  role: EnemyRole;
  biome: string | null;
  biomeUnknown: boolean;
  icon_key: string;
  /** True when icon_key was inferred automatically. */
  iconAuto: boolean;
  color: string;
  max_hp: number;
  defense: number;
  speed: string;
  base_damage: string | null;
  description: string | null;
  behavior_notes: string | null;
  weaknesses_text: string | null;
  immunities: string[];
  skills: ImportedEnemySkill[];
  rowIndex: number;
};

export type ImportWarning = { where: string; message: string };
export type ImportError = { where: string; message: string };
export type EnemyImportResult = {
  enemies: ImportedEnemy[];
  totalSkills: number;
  warnings: ImportWarning[];
  errors: ImportError[];
};

function norm(s: any): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}
function clean(v: any): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}
function toInt(v: any, fallback = 0): number {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

const TIER_ALIASES: Record<string, EnemyTier> = {
  normal: "normal", common: "normal", comun: "normal", regular: "normal",
  elite: "elite", "élite": "elite",
  boss: "boss", jefe: "boss", "jefa": "boss",
  god: "god", dios: "god", deity: "god", divino: "god",
  minion: "minion", esbirro: "minion",
  summon: "summon", invocacion: "summon", invocación: "summon",
  hazard: "hazard", trampa: "hazard", peligro: "hazard",
  special: "special", especial: "special",
  // hero variants map to closest tier; visual asset is handled by name match in importer
  hero: "special", heroe: "special", "héroe": "special",
};
const ROLE_ALIASES: Record<string, EnemyRole> = {
  damage: "damage", dano: "damage", daño: "damage", dps: "damage",
  tank: "tank", tanque: "tank",
  support: "support", soporte: "support", apoyo: "support",
  control: "control",
  skirmisher: "skirmisher", hostigador: "skirmisher",
  summoner: "summoner", invocador: "summoner",
  terrain: "terrain", terreno: "terrain",
  hunter: "hunter", cazador: "hunter",
  protector: "protector",
};
const RARITY_ALIASES: Record<string, ImportedEnemySkill["rarity"]> = {
  white: "white", blanca: "white", blanco: "white", comun: "white", "común": "white",
  green: "green", verde: "green",
  blue: "blue", azul: "blue", rara: "blue",
  purple: "purple", morada: "purple", morado: "purple", purpura: "purple", "púrpura": "purple",
  orange: "orange", naranja: "orange",
  red: "red", roja: "red", rojo: "red",
};

function mapTier(raw: any): { tier: EnemyTier; missing: boolean; heroVariant?: "hero_female" | "hero_male" } {
  const k = norm(raw);
  if (!k) return { tier: "normal", missing: true };
  // Hero female / male shortcuts
  if (/hero.*fem|heroe.*fem|hero.*female|heroina|heroína/.test(k)) {
    return { tier: "special", missing: false, heroVariant: "hero_female" };
  }
  if (/hero.*mal|heroe.*mal|hero.*male/.test(k)) {
    return { tier: "special", missing: false, heroVariant: "hero_male" };
  }
  if (TIER_ALIASES[k]) return { tier: TIER_ALIASES[k], missing: false };
  // direct match against known options
  if (TIER_OPTIONS.includes(k as EnemyTier)) return { tier: k as EnemyTier, missing: false };
  return { tier: "normal", missing: true };
}
function mapRole(raw: any): EnemyRole {
  const k = norm(raw);
  if (ROLE_ALIASES[k]) return ROLE_ALIASES[k];
  if (ROLE_OPTIONS.includes(k as EnemyRole)) return k as EnemyRole;
  return "damage";
}
function mapRarity(raw: any): ImportedEnemySkill["rarity"] {
  const k = norm(raw);
  return RARITY_ALIASES[k] || "white";
}
/** Normalize the visual asset value to an icon_key string (or null). */
function mapVisualAsset(raw: any): string | null {
  const k = norm(raw).replace(/^\d+\s*/, ""); // strip leading "1 ", "2 ", etc.
  if (!k) return null;
  if (/normal/.test(k)) return "asset:normal";
  if (/elit/.test(k)) return "asset:elite";
  if (/boss|jef/.test(k)) return "asset:boss";
  if (/god|dios/.test(k)) return "asset:god";
  if (/(hero|heroe|héroe).*(fem|female)|fem.*(hero|heroe)/.test(k)) return "asset:hero_female";
  if (/(hero|heroe|héroe).*(mal|male)|mal.*(hero|heroe)/.test(k)) return "asset:hero_male";
  return null;
}
function mapImmunities(raw: any): string[] {
  if (!raw) return [];
  return String(raw).split(/[,;|]/).map(s => norm(s)).filter(Boolean);
}
function pickBiome(raw: any): { biome: string | null; unknown: boolean } {
  const t = clean(raw);
  if (!t) return { biome: null, unknown: false };
  const match = BIOME_PRESETS.find(b => norm(b) === norm(t));
  if (match) return { biome: match, unknown: false };
  return { biome: t, unknown: true };
}

// ─────────────── Header mapping ───────────────

type HeaderField =
  | "key" | "name" | "tier" | "role" | "biome" | "hp" | "defense" | "speed"
  | "base_damage" | "description" | "behavior" | "immunities" | "weaknesses"
  | "icon" | "asset" | "color"
  // skill fields (option B: enemy skills sheet)
  | "s_name" | "s_rarity" | "s_type" | "s_dice" | "s_range" | "s_targets"
  | "s_effect" | "s_visual" | "s_shape" | "s_order";

const ENEMY_HEADERS: Record<string, HeaderField> = {
  "enemy_key": "key", "key": "key", "id": "key", "clave": "key",
  "nombre": "name", "name": "name",
  "tier": "tier", "categoria": "tier", "categoría": "tier", "rango": "tier",
  "rol": "role", "role": "role",
  "bioma": "biome", "biome": "biome", "region": "biome", "región": "biome",
  "hp": "hp", "vida": "hp", "max hp": "hp", "max_hp": "hp", "hp max": "hp", "puntos de vida": "hp",
  "defensa": "defense", "defense": "defense", "def": "defense",
  "velocidad": "speed", "speed": "speed",
  "dano base": "base_damage", "daño base": "base_damage", "base damage": "base_damage", "base_damage": "base_damage",
  "descripcion": "description", "descripción": "description", "description": "description",
  "conducta": "behavior", "behavior": "behavior", "comportamiento": "behavior", "notas": "behavior",
  "inmunidades": "immunities", "immunities": "immunities",
  "debilidades": "weaknesses", "weaknesses": "weaknesses",
  "icono": "icon", "icon": "icon",
  "asset": "asset", "asset visual": "asset", "visual": "asset",
  "color": "color",
};

const SKILL_HEADERS: Record<string, HeaderField> = {
  "enemy_key": "key", "key": "key", "id": "key", "clave": "key",
  "nombre": "s_name", "name": "s_name",
  "rareza": "s_rarity", "rarity": "s_rarity",
  "tipo": "s_type", "type": "s_type",
  "dados": "s_dice", "dice": "s_dice",
  "alcance": "s_range", "range": "s_range",
  "objetivos": "s_targets", "targets": "s_targets",
  "efecto": "s_effect", "effect": "s_effect",
  "visual": "s_visual", "visual breve": "s_visual",
  "forma": "s_shape", "shape": "s_shape", "forma de ejecucion": "s_shape", "forma de ejecución": "s_shape",
  "orden": "s_order", "order": "s_order", "order_index": "s_order",
};

function buildColMap<T extends Record<string, HeaderField>>(
  headers: string[], dict: T,
): Record<number, HeaderField> {
  const map: Record<number, HeaderField> = {};
  headers.forEach((h, i) => {
    const k = norm(h);
    if (dict[k]) map[i] = dict[k];
  });
  return map;
}

function findHeaderRow(aoa: any[][], dict: Record<string, HeaderField>): number {
  for (let i = 0; i < Math.min(aoa.length, 8); i++) {
    const row = aoa[i] || [];
    const hits = row.filter(c => dict[norm(c)]).length;
    if (hits >= 2) return i;
  }
  return -1;
}

// ─────────────── Option B: two-sheet workbook ───────────────

function parseEnemiesSheet(sheet: any): { enemies: Map<string, ImportedEnemy>; warnings: ImportWarning[]; errors: ImportError[] } {
  const warnings: ImportWarning[] = [];
  const errors: ImportError[] = [];
  const out = new Map<string, ImportedEnemy>();
  if (!sheet) return { enemies: out, warnings, errors };
  const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIdx = findHeaderRow(aoa, ENEMY_HEADERS);
  if (headerIdx < 0) {
    errors.push({ where: "Enemies", message: "No se encontraron encabezados de enemigo (Nombre, Tier, HP…)." });
    return { enemies: out, warnings, errors };
  }
  const colMap = buildColMap(aoa[headerIdx].map(String), ENEMY_HEADERS);
  if (!Object.values(colMap).includes("name")) {
    errors.push({ where: "Enemies", message: "Falta columna 'Nombre'." });
    return { enemies: out, warnings, errors };
  }
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every(c => clean(c) === "")) continue;
    const get = (f: HeaderField) => {
      for (const [iStr, k] of Object.entries(colMap)) if (k === f) return row[Number(iStr)];
      return undefined;
    };
    const name = clean(get("name"));
    if (!name) continue;
    const hp = toInt(get("hp"), 10);
    if (hp <= 0) { warnings.push({ where: `Fila ${r + 1}`, message: `"${name}": HP inválido, se usa 10.` }); }
    const def = toInt(get("defense"), 0);
    if (def < 0) { warnings.push({ where: `Fila ${r + 1}`, message: `"${name}": defensa negativa, se usa 0.` }); }
    const tierInfo = mapTier(get("tier"));
    const role = mapRole(get("role"));
    const biomeInfo = pickBiome(get("biome"));
    if (biomeInfo.unknown) {
      warnings.push({ where: `Fila ${r + 1}`, message: `"${name}": bioma no estándar "${biomeInfo.biome}".` });
    }

    // Visual asset: explicit asset overrides tier default. Hero variant from tier wins next.
    const explicitAsset = mapVisualAsset(get("asset"));
    const heroAsset = tierInfo.heroVariant ? `asset:${tierInfo.heroVariant}` : null;
    let icon = explicitAsset || heroAsset || clean(get("icon")) || "";
    let iconAuto = false;
    if (!icon) {
      const tv = getTierVisual(tierInfo.heroVariant || tierInfo.tier);
      if (tv && !tierInfo.missing) {
        icon = tv.assetKey;
      } else {
        icon = pickAutoIcon(name, role);
        iconAuto = true;
      }
    }
    // Border color: prefer tier default border. If explicit color in sheet → use it.
    const explicitColor = clean(get("color"));
    const tv = getTierVisual(tierInfo.heroVariant || tierInfo.tier);
    const color = explicitColor || (tv ? tv.border : "#ef4444");

    const key = clean(get("key")) || norm(name);
    out.set(key, {
      key,
      name,
      tier: tierInfo.tier,
      tierMissing: tierInfo.missing,
      role,
      biome: biomeInfo.biome,
      biomeUnknown: biomeInfo.unknown,
      icon_key: icon,
      iconAuto,
      color,
      max_hp: Math.max(1, hp),
      defense: Math.max(0, def),
      speed: clean(get("speed")) || "30",
      base_damage: clean(get("base_damage")) || null,
      description: clean(get("description")) || null,
      behavior_notes: clean(get("behavior")) || null,
      weaknesses_text: clean(get("weaknesses")) || null,
      immunities: mapImmunities(get("immunities")),
      skills: [],
      rowIndex: r + 1,
    });
  }
  return { enemies: out, warnings, errors };
}

function parseSkillsSheet(sheet: any, enemies: Map<string, ImportedEnemy>): { warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  if (!sheet) return { warnings };
  const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIdx = findHeaderRow(aoa, SKILL_HEADERS);
  if (headerIdx < 0) return { warnings };
  const colMap = buildColMap(aoa[headerIdx].map(String), SKILL_HEADERS);

  const orderByEnemy = new Map<string, number>();
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every(c => clean(c) === "")) continue;
    const get = (f: HeaderField) => {
      for (const [iStr, k] of Object.entries(colMap)) if (k === f) return row[Number(iStr)];
      return undefined;
    };
    const sName = clean(get("s_name"));
    if (!sName) continue;
    const rawKey = clean(get("key"));
    const key = rawKey ? (enemies.has(rawKey) ? rawKey : norm(rawKey)) : "";
    const target = key && enemies.get(key);
    if (!target) {
      warnings.push({ where: `Fila ${r + 1}`, message: `Skill "${sName}" sin enemigo coincidente (key="${rawKey}").` });
      continue;
    }
    const order = orderByEnemy.get(target.key) ?? 0;
    orderByEnemy.set(target.key, order + 1);
    target.skills.push({
      name: sName,
      rarity: mapRarity(get("s_rarity")),
      skill_type: clean(get("s_type")) || null,
      target_shape: clean(get("s_shape")) || null,
      targets: clean(get("s_targets")) || null,
      dice: clean(get("s_dice")) || null,
      range_text: clean(get("s_range")) || null,
      effect: clean(get("s_effect")) || null,
      visual_brief: clean(get("s_visual")) || null,
      order_index: toInt(get("s_order"), order),
    });
  }
  return { warnings };
}

// ─────────────── Option A: single-sheet with "Skill N Field" columns ───────────────

function parseFlatSheet(sheet: any): EnemyImportResult {
  const warnings: ImportWarning[] = [];
  const errors: ImportError[] = [];
  const enemies: ImportedEnemy[] = [];
  const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIdx = findHeaderRow(aoa, ENEMY_HEADERS);
  if (headerIdx < 0) {
    errors.push({ where: "Sheet", message: "No se encontraron encabezados reconocibles." });
    return { enemies, totalSkills: 0, warnings, errors };
  }
  const rawHeaders = (aoa[headerIdx] || []).map(String);
  const enemyColMap = buildColMap(rawHeaders, ENEMY_HEADERS);

  // Detect "Skill N <field>" columns.
  type SkillCol = { idx: number; n: number; field: keyof ImportedEnemySkill | "shape" };
  const skillColRegex = /^skill\s*(\d+)\s+(nombre|name|rareza|rarity|tipo|type|dados|dice|alcance|range|objetivos|targets|efecto|effect|visual( breve)?|forma|shape)$/;
  const SK_FIELD: Record<string, keyof ImportedEnemySkill | "shape"> = {
    nombre: "name", name: "name",
    rareza: "rarity", rarity: "rarity",
    tipo: "skill_type", type: "skill_type",
    dados: "dice", dice: "dice",
    alcance: "range_text", range: "range_text",
    objetivos: "targets", targets: "targets",
    efecto: "effect", effect: "effect",
    visual: "visual_brief", "visual breve": "visual_brief",
    forma: "target_shape", shape: "target_shape",
  };
  const skillCols: SkillCol[] = [];
  rawHeaders.forEach((h, i) => {
    const m = norm(h).match(skillColRegex);
    if (m) {
      const fkey = m[2].trim();
      const field = SK_FIELD[fkey];
      if (field) skillCols.push({ idx: i, n: parseInt(m[1], 10), field });
    }
  });

  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every(c => clean(c) === "")) continue;
    const get = (f: HeaderField) => {
      for (const [iStr, k] of Object.entries(enemyColMap)) if (k === f) return row[Number(iStr)];
      return undefined;
    };
    const name = clean(get("name"));
    if (!name) continue;
    const hp = toInt(get("hp"), 10);
    const def = toInt(get("defense"), 0);
    const tierInfo = mapTier(get("tier"));
    const role = mapRole(get("role"));
    const biomeInfo = pickBiome(get("biome"));
    if (biomeInfo.unknown) warnings.push({ where: `Fila ${r + 1}`, message: `"${name}": bioma no estándar "${biomeInfo.biome}".` });
    const explicitAsset = mapVisualAsset(get("asset"));
    const heroAsset = tierInfo.heroVariant ? `asset:${tierInfo.heroVariant}` : null;
    let icon = explicitAsset || heroAsset || clean(get("icon")) || "";
    let iconAuto = false;
    if (!icon) {
      const tv = getTierVisual(tierInfo.heroVariant || tierInfo.tier);
      if (tv && !tierInfo.missing) icon = tv.assetKey;
      else { icon = pickAutoIcon(name, role); iconAuto = true; }
    }
    const tv = getTierVisual(tierInfo.heroVariant || tierInfo.tier);
    const color = clean(get("color")) || (tv ? tv.border : "#ef4444");

    // Group skill columns by N
    const skillsByN = new Map<number, Partial<ImportedEnemySkill>>();
    for (const sc of skillCols) {
      const val = clean(row[sc.idx]);
      if (!val) continue;
      const draft = skillsByN.get(sc.n) || {};
      if (sc.field === "rarity") (draft as any).rarity = mapRarity(val);
      else (draft as any)[sc.field] = val;
      skillsByN.set(sc.n, draft);
    }
    const skills: ImportedEnemySkill[] = [];
    [...skillsByN.entries()].sort((a, b) => a[0] - b[0]).forEach(([_, d], idx) => {
      if (!d.name) return;
      skills.push({
        name: d.name!, rarity: (d.rarity as any) || "white",
        skill_type: d.skill_type || null, target_shape: d.target_shape || null,
        targets: d.targets || null, dice: d.dice || null,
        range_text: d.range_text || null, effect: d.effect || null,
        visual_brief: d.visual_brief || null, order_index: idx,
      });
    });

    enemies.push({
      key: norm(name), name,
      tier: tierInfo.tier, tierMissing: tierInfo.missing, role,
      biome: biomeInfo.biome, biomeUnknown: biomeInfo.unknown,
      icon_key: icon, iconAuto, color,
      max_hp: Math.max(1, hp), defense: Math.max(0, def),
      speed: clean(get("speed")) || "30",
      base_damage: clean(get("base_damage")) || null,
      description: clean(get("description")) || null,
      behavior_notes: clean(get("behavior")) || null,
      weaknesses_text: clean(get("weaknesses")) || null,
      immunities: mapImmunities(get("immunities")),
      skills, rowIndex: r + 1,
    });
  }
  const totalSkills = enemies.reduce((acc, e) => acc + e.skills.length, 0);
  return { enemies, totalSkills, warnings, errors };
}

// ─────────────── Entry point ───────────────

export async function parseEnemyFile(file: File): Promise<EnemyImportResult> {
  const lower = file.name.toLowerCase();
  if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls"))) {
    return { enemies: [], totalSkills: 0, warnings: [], errors: [{ where: file.name, message: "Formato no soportado. Usa .xlsx" }] };
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // Prefer Option B if a sheet named "enemies"/"enemigos" exists.
  const sheetNames = wb.SheetNames;
  const findSheet = (...candidates: string[]) => {
    for (const name of sheetNames) if (candidates.some(c => norm(name) === c)) return wb.Sheets[name];
    return null;
  };
  const enemiesSheet = findSheet("enemies", "enemigos", "enemy or monster", "enemigo o monstruo");
  const skillsSheet = findSheet("enemy skills", "skills", "habilidades", "enemy_skills");
  if (enemiesSheet) {
    const e = parseEnemiesSheet(enemiesSheet);
    const s = skillsSheet ? parseSkillsSheet(skillsSheet, e.enemies) : { warnings: [] };
    const enemies = [...e.enemies.values()];
    return {
      enemies,
      totalSkills: enemies.reduce((acc, x) => acc + x.skills.length, 0),
      warnings: [...e.warnings, ...s.warnings],
      errors: e.errors,
    };
  }
  // Fallback: parse first sheet as flat (Option A).
  const firstSheet = wb.Sheets[sheetNames[0]];
  if (!firstSheet) {
    return { enemies: [], totalSkills: 0, warnings: [], errors: [{ where: file.name, message: "Excel vacío." }] };
  }
  return parseFlatSheet(firstSheet);
}

// ─────────────── Persistence helpers ───────────────

export type DuplicateMode = "skip" | "update" | "create";

export type EnemyImportPlan = {
  /** For each imported enemy: what to do when a same-name template already exists. */
  modeByKey: Record<string, DuplicateMode>;
};

void TIER_VISUALS; // re-export anchor (silence linter); also makes the module self-documenting
void isPresetBiome;
