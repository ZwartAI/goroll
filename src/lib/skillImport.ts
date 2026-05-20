import * as XLSX from "xlsx";
import type { Rarity } from "./game";

export type ParsedSkill = {
  name: string;
  rarity: Rarity;
  type: string | null;
  effect: string | null;
  dice: string | null;
  range_targets: string | null;
  visual_brief: string | null;
  imported_row_index: number;
  rarityInferred: boolean;
};

export type SkillParseError = { where: string; message: string };
export type SkillParseResult = { rows: ParsedSkill[]; warnings: SkillParseError[]; errors: SkillParseError[] };

const RARITY_ALIASES: Record<string, Rarity> = {
  blanca: "white", blanco: "white", comun: "white", común: "white", white: "white",
  azul: "blue", rara: "blue", blue: "blue",
  morada: "purple", morado: "purple", purpura: "purple", púrpura: "purple", purple: "purple",
  dorada: "gold", dorado: "gold", oro: "gold", legendaria: "gold", gold: "gold",
};

export function normKey(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable name comparison key — used to dedupe across imports for a same character. */
export function skillNameKey(s: string): string {
  return normKey(s).replace(/\s+/g, " ");
}

export const SKILL_RARITY_COST: Record<Rarity, number> = {
  white: 1,
  blue: 2,
  purple: 3,
  gold: 10,
};

/** Header label → column key. Tolerant to common variants. */
const HEADER_MAP: Record<string, keyof ParsedSkill | "rarity"> = {
  "nombre": "name",
  "rareza": "rarity",
  "tipo": "type",
  "tipo de habilidad": "type",
  "efecto": "effect",
  "efecto o uso": "effect",
  "dados": "dice",
  "dados a tirar": "dice",
  "alcance": "range_targets",
  "alcance y objetivos": "range_targets",
  "alcance/objetivos": "range_targets",
  "objetivos": "range_targets",
  "visual": "visual_brief",
  "visual breve": "visual_brief",
  "descripcion visual": "visual_brief",
};

/** Map cell fill color (hex without # or alpha) to a Rarity. */
function rarityFromHex(hex: string | null): Rarity | null {
  if (!hex) return null;
  let h = hex.toUpperCase();
  // Strip alpha prefix (FFRRGGBB)
  if (h.length === 8) h = h.slice(2);
  if (h.length !== 6) return null;
  const table: Record<string, Rarity> = {
    "FFF7E6": "white", // crema
    "DCEEFF": "blue",  // celeste
    "EADCF8": "purple",// lila
    "FDE9A9": "gold",  // dorado
  };
  if (table[h]) return table[h];
  // Soft RGB heuristic for slight tone variations.
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (r > 240 && g > 220 && b < 200) return "gold";
  if (r > 200 && b > 230 && g > 220) return "blue";
  if (r > 220 && g < 230 && b > 230) return "purple";
  if (r > 245 && g > 240 && b > 215 && b < 245) return "white";
  return null;
}

function rarityFromText(raw: any): Rarity | null {
  const k = normKey(String(raw ?? ""));
  return RARITY_ALIASES[k] ?? null;
}

function clean(v: any): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

/** Read a single Excel cell's fill color (without alpha) from styled workbook. */
function fillHex(sheet: any, addr: string): string | null {
  const c = sheet?.[addr];
  const fg = c?.s?.fgColor?.rgb || c?.s?.bgColor?.rgb;
  return fg ? String(fg) : null;
}

export function parseSkillsXlsx(buf: ArrayBuffer): SkillParseResult {
  const wb = XLSX.read(buf, { type: "array", cellStyles: true } as any);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const warnings: SkillParseError[] = [];
  const errors: SkillParseError[] = [];
  if (!sheet) return { rows: [], warnings, errors: [{ where: "xlsx", message: "Hoja vacía" }] };

  const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  // Header is expected at row 2 (index 1). Tolerate row 1 (no general title).
  const looksLikeHeader = (row: any[]) =>
    row.some(c => normKey(String(c)) in HEADER_MAP);

  let headerIdx = -1;
  if (aoa[1] && looksLikeHeader(aoa[1])) headerIdx = 1;
  else if (aoa[0] && looksLikeHeader(aoa[0])) headerIdx = 0;
  else headerIdx = aoa.findIndex(r => looksLikeHeader(r));

  if (headerIdx < 0) return { rows: [], warnings, errors: [{ where: "xlsx", message: "No se encontraron encabezados (Nombre, Rareza, Tipo, ...)" }] };

  const headers = aoa[headerIdx].map(c => normKey(String(c)));
  const colMap: Record<number, keyof ParsedSkill | "rarity"> = {};
  headers.forEach((h, i) => {
    const k = HEADER_MAP[h];
    if (k) colMap[i] = k;
  });

  if (colMap && !Object.values(colMap).includes("name" as any)) {
    return { rows: [], warnings, errors: [{ where: "xlsx", message: "Falta columna 'Nombre'" }] };
  }
  const hasRarityCol = Object.values(colMap).includes("rarity" as any);
  if (!hasRarityCol) {
    warnings.push({ where: "xlsx", message: "No se encontró columna 'Rareza'. Se inferirá por color de la fila." });
  }

  const rows: ParsedSkill[] = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every(c => clean(c) === "")) continue;
    const draft: any = {};
    let rarityCellAddr: string | null = null;
    for (const [iStr, key] of Object.entries(colMap)) {
      const i = Number(iStr);
      draft[key] = clean(row[i]);
      if (key === "rarity") rarityCellAddr = XLSX.utils.encode_cell({ r, c: i });
    }
    const name = clean(draft.name);
    if (!name) continue; // skip nameless rows
    let rarity = rarityFromText(draft.rarity);
    let rarityInferred = false;
    if (!rarity) {
      // Try to infer from the row's fill color: scan the row's mapped cells.
      let inferred: Rarity | null = null;
      for (const iStr of Object.keys(colMap)) {
        const i = Number(iStr);
        const addr = XLSX.utils.encode_cell({ r, c: i });
        const hex = fillHex(sheet, addr);
        const guess = rarityFromHex(hex);
        if (guess) { inferred = guess; break; }
      }
      if (inferred) {
        rarity = inferred;
        rarityInferred = true;
      } else {
        rarity = "white";
        rarityInferred = true;
        warnings.push({ where: `Fila ${r + 1}`, message: `"${name}": no se pudo inferir rareza, se asignó Blanca por defecto.` });
      }
    }
    rows.push({
      name,
      rarity,
      type: clean(draft.type) || null,
      effect: clean(draft.effect) || null,
      dice: clean(draft.dice) || null,
      range_targets: clean(draft.range_targets) || null,
      visual_brief: clean(draft.visual_brief) || null,
      imported_row_index: r + 1,
      rarityInferred,
    });
    void rarityCellAddr;
  }

  return { rows, warnings, errors };
}

export async function parseSkillFile(file: File): Promise<SkillParseResult> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    return parseSkillsXlsx(buf);
  }
  return { rows: [], warnings: [], errors: [{ where: file.name, message: "Formato no soportado. Usa .xlsx" }] };
}
