/**
 * Sync BDPM officielle → schéma bdm
 * Source: https://base-donnees-publique.medicaments.gouv.fr/download/file/
 *
 * Encodage : UTF-8 d’abord ; fallback windows-1252 seulement si beaucoup de \uFFFD.
 * Après déploiement, relancer la sync via Dashboard → BDPM → « Synchroniser BDPM ».
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const BDPM_BASE =
  "https://base-donnees-publique.medicaments.gouv.fr/download/file";
const BATCH_SIZE = 1200;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Env Edge manquante" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "bdm" },
  });

  let triggeredBy: string | null = null;
  try {
    const body = await req.json();
    if (body?.triggered_by && typeof body.triggered_by === "string") {
      triggeredBy = body.triggered_by;
    }
  } catch { /* optional */ }

  const { data: run, error: runErr } = await admin
    .from("sync_runs")
    .insert({ status: "running", triggered_by: triggeredBy, source_files: [], rows_loaded: {} })
    .select("id")
    .single();
  if (runErr || !run) {
    return json({ error: runErr?.message || "sync_runs" }, 500);
  }

  const runId = run.id as number;
  const rowsLoaded: Record<string, number> = {};
  const sourceFiles: string[] = [];

  try {
    const { error: truncErr } = await admin.rpc("truncate_official_tables");
    if (truncErr) throw new Error(`truncate: ${truncErr.message}`);

    {
      const text = await downloadText("CIS_bdpm.txt");
      sourceFiles.push("CIS_bdpm.txt");
      const rows = parseLines(text).map((cols) => ({
        cis: emptyToNull(cols[0])!,
        denomination: emptyToNull(cols[1]) ?? "",
        forme_pharmaceutique: emptyToNull(cols[2]),
        voies_administration: emptyToNull(cols[3]),
        statut_amm: emptyToNull(cols[4]),
        type_procedure: emptyToNull(cols[5]),
        etat_commercialisation: emptyToNull(cols[6]),
        date_amm: parseFrDate(cols[7]),
        statut_bdm: emptyToNull(cols[8]),
        numero_autorisation_europeenne: emptyToNull(cols[9]),
        titulaires: emptyToNull(cols[10]),
        surveillance_renforcee: parseOuiNon(cols[11]),
      })).filter((r) => r.cis && r.denomination);
      rowsLoaded.specialites = await bulkInsert(admin, "bulk_insert_specialites", rows);
    }

    {
      const text = await downloadText("CIS_CIP_bdpm.txt");
      sourceFiles.push("CIS_CIP_bdpm.txt");
      const rows = parseLines(text).map((cols) => ({
        cis: emptyToNull(cols[0]),
        cip7: emptyToNull(cols[1]),
        libelle: emptyToNull(cols[2]),
        statut_administratif: emptyToNull(cols[3]),
        etat_commercialisation: emptyToNull(cols[4]),
        date_declaration_commercialisation: parseFrDate(cols[5]),
        cip13: emptyToNull(cols[6]),
        agrement_collectivites: emptyToNull(cols[7]),
        taux_remboursement: emptyToNull(cols[8]),
        prix_euro: parseEuro(cols[9]),
        prix_hors_honoraire: parseEuro(cols[10]),
        honoraire: parseEuro(cols[11]),
        indications_remboursement: emptyToNull(cols[12]),
      })).filter((r) => r.cis);
      rowsLoaded.presentations = await bulkInsert(admin, "bulk_insert_presentations", rows);
    }

    {
      const text = await downloadText("CIS_COMPO_bdpm.txt");
      sourceFiles.push("CIS_COMPO_bdpm.txt");
      const rows = parseLines(text).map((cols) => ({
        cis: emptyToNull(cols[0]),
        designation_element_pharmaceutique: emptyToNull(cols[1]),
        code_substance: emptyToNull(cols[2]),
        denomination_substance: emptyToNull(cols[3]),
        dosage: emptyToNull(cols[4]),
        reference_dosage: emptyToNull(cols[5]),
        nature_composant: emptyToNull(cols[6]),
        numero_lien: parseIntOrNull(cols[7]),
      })).filter((r) => r.cis);
      rowsLoaded.compositions = await bulkInsert(admin, "bulk_insert_compositions", rows);
    }

    {
      const text = await downloadText("CIS_GENER_bdpm.txt");
      sourceFiles.push("CIS_GENER_bdpm.txt");
      const rows = parseLines(text).map((cols) => ({
        identifiant_groupe: emptyToNull(cols[0]) ?? "",
        libelle_groupe: emptyToNull(cols[1]),
        cis: emptyToNull(cols[2]),
        type: parseIntOrNull(cols[3]),
        numero_tri: parseIntOrNull(cols[4]),
      })).filter((r) => r.cis && r.identifiant_groupe);
      rowsLoaded.generiques = await bulkInsert(admin, "bulk_insert_generiques", rows);
    }

    const { data: molCount, error: molErr } = await admin.rpc("rebuild_molecules_from_compositions");
    if (molErr) throw new Error(`molecules: ${molErr.message}`);
    rowsLoaded.molecules_upserted = Number(molCount ?? 0);

    await admin.from("sync_meta").upsert({
      id: 1,
      last_synced_at: new Date().toISOString(),
      source_files: sourceFiles,
      rows_loaded: rowsLoaded,
      status: "success",
      error_message: null,
      updated_at: new Date().toISOString(),
    });

    await admin.from("sync_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      source_files: sourceFiles,
      rows_loaded: rowsLoaded,
      error_message: null,
    }).eq("id", runId);

    return json({
      ok: true,
      sync_run_id: runId,
      source_files: sourceFiles,
      rows_loaded: rowsLoaded,
      licence: "Source : BDPM ANSM — données non altérées.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("sync_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      source_files: sourceFiles,
      rows_loaded: rowsLoaded,
      error_message: message.slice(0, 4000),
    }).eq("id", runId);
    await admin.from("sync_meta").upsert({
      id: 1,
      status: "failed",
      error_message: message.slice(0, 4000),
      updated_at: new Date().toISOString(),
    });
    return json({ ok: false, sync_run_id: runId, error: message }, 500);
  }
});

async function downloadText(file: string): Promise<string> {
  const res = await fetch(`${BDPM_BASE}/${file}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${file}`);
  return decodeBdpm(new Uint8Array(await res.arrayBuffer()));
}

/**
 * UTF-8 d’abord. Fallback windows-1252 seulement si le décodage UTF-8
 * produit beaucoup de caractères de remplacement (\uFFFD).
 * (Évite le mojibake Ã© quand du UTF-8 était décodé en win-1252.)
 */
function decodeBdpm(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return utf8;
  }
  const badUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const threshold = Math.max(8, Math.floor(bytes.length * 0.001));
  if (badUtf8 <= threshold) return utf8;

  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

function parseLines(text: string): string[][] {
  return text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean).map((l) => l.split("\t"));
}
function emptyToNull(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function parseFrDate(v: string | undefined): string | null {
  const s = emptyToNull(v);
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function parseOuiNon(v: string | undefined): boolean {
  const s = (emptyToNull(v) || "").toLowerCase();
  return s === "oui" || s === "yes" || s === "true" || s === "1";
}
function parseEuro(v: string | undefined): number | null {
  const s = emptyToNull(v);
  if (!s) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function parseIntOrNull(v: string | undefined): number | null {
  const s = emptyToNull(v);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

async function bulkInsert(admin: SupabaseClient, rpcName: string, rows: Record<string, unknown>[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await admin.rpc(rpcName, { payload: chunk });
    if (error) throw new Error(`${rpcName}@${i}: ${error.message}`);
    total += Number(data ?? chunk.length);
  }
  return total;
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json", Connection: "keep-alive" },
  });
}
