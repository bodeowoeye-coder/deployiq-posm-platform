import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const workspaceRoot = path.resolve(process.cwd());
const envPath = path.resolve(workspaceRoot, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

action();

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") continue;
      row.push(field);
      field = "";
      if (row.length !== 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function action() {
  const csvPathCandidates = [
    path.resolve(process.env.HOME || "", "Downloads", "DeployIQ_Approved_Outlets_Cleaned_Import_Ready.csv"),
    path.resolve(workspaceRoot, "DeployIQ_Approved_Outlets_Cleaned_Import_Ready.csv"),
    path.resolve(workspaceRoot, "downloads", "DeployIQ_Approved_Outlets_Cleaned_Import_Ready.csv")
  ];
  const csvPath = csvPathCandidates.find((p) => fs.existsSync(p));
  if (!csvPath) {
    console.error("CSV file not found in expected locations:");
    console.error(csvPathCandidates.join("\n"));
    process.exit(1);
  }

  const rawCsv = fs.readFileSync(csvPath, "utf8");
  const parsed = parseCsv(rawCsv);
  if (parsed.length < 2) {
    console.error("CSV parse failed or is empty.");
    process.exit(1);
  }

  const headers = parsed[0].map((h) => h.trim());
  const rows = parsed.slice(1).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] ?? "";
    });
    return entry;
  });

  const totalRows = rows.length;
  const blankOutletCodeRows = rows.filter((row) => !row["outlet_code"]?.trim());
  const blankOutletNameRows = rows.filter((row) => !row["outlet_name"]?.trim());

  const outletCodeCounts = new Map();
  const nameAddressCounts = new Map();
  rows.forEach((row) => {
    const code = row["outlet_code"]?.trim();
    if (code) {
      outletCodeCounts.set(code, (outletCodeCounts.get(code) || 0) + 1);
    }
    const name = normalize(row["outlet_name"]);
    const address = normalize(row["address"] || row["outlet_address"] || "");
    const state = normalize(row["state"] || row["installer_state"] || "");
    const key = `${name}||${address}||${state}`;
    nameAddressCounts.set(key, (nameAddressCounts.get(key) || 0) + 1);
  });

  const duplicateOutletCodes = [...outletCodeCounts.entries()].filter(([, count]) => count > 1);
  const duplicateNameAddress = [...nameAddressCounts.entries()].filter(([, count]) => count > 1);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let dbTotal = null;
  let matchedRows = [];
  let missingRows = [];
  let missingPath = null;
  let dbCompareEnabled = Boolean(supabaseUrl && supabaseKey);

  if (dbCompareEnabled) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    console.log("Querying public.deployment_locations...");
    const { data: dbRows, error } = await supabase
      .from("deployment_locations")
      .select("id,outlet_code,outlet_name,address,state")
      .order("id", { ascending: true });
    if (error) {
      console.error("Supabase query error:", error.message);
      process.exit(1);
    }
    dbTotal = dbRows.length;

    const dbByCode = new Map();
    const dbByNameAddressState = new Map();
    dbRows.forEach((row) => {
      const code = row.outlet_code?.trim();
      if (code) {
        const key = normalize(code);
        dbByCode.set(key, dbByCode.get(key) || []);
        dbByCode.get(key).push(row);
      }
      const name = normalize(row.outlet_name);
      const address = normalize(row.address);
      const state = normalize(row.state);
      const key = `${name}||${address}||${state}`;
      dbByNameAddressState.set(key, dbByNameAddressState.get(key) || []);
      dbByNameAddressState.get(key).push(row);
    });

    matchedRows = [];
    missingRows = [];

    rows.forEach((row) => {
      const code = row["outlet_code"]?.trim();
      const name = normalize(row["outlet_name"]);
      const address = normalize(row["address"] || row["outlet_address"] || "");
      const state = normalize(row["state"] || row["installer_state"] || "");
      if (code) {
        const dbMatches = dbByCode.get(normalize(code));
        if (dbMatches && dbMatches.length > 0) {
          matchedRows.push({ row, match: "code", dbMatches });
          return;
        }
      }
      const key = `${name}||${address}||${state}`;
      const dbMatches = dbByNameAddressState.get(key);
      if (dbMatches && dbMatches.length > 0) {
        matchedRows.push({ row, match: "name+address+state", dbMatches });
        return;
      }
      missingRows.push(row);
    });

    missingPath = path.resolve(workspaceRoot, "missing_deployment_locations.csv");
    const outputHeaders = headers;
    const outputLines = [outputHeaders.join(",")].concat(
      missingRows.map((row) =>
        outputHeaders
          .map((header) => {
            const value = row[header] ?? "";
            if (value.includes(",") || value.includes("\"")) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(",")
      )
    );
    fs.writeFileSync(missingPath, outputLines.join("\n"), "utf8");
  }

  console.log("--- Reconciliation Report ---");
  console.log(`CSV path: ${csvPath}`);
  console.log(`CSV total rows: ${totalRows}`);
  console.log(`Blank outlet_code rows: ${blankOutletCodeRows.length}`);
  console.log(`Blank outlet_name rows: ${blankOutletNameRows.length}`);
  console.log(`Duplicate outlet_code values: ${duplicateOutletCodes.length}`);
  console.log(`Duplicate outlet_name+address+state combos: ${duplicateNameAddress.length}`);
  if (dbCompareEnabled) {
    console.log(`DB total deployment_locations: ${dbTotal}`);
    console.log(`CSV matched rows: ${matchedRows.length}`);
    console.log(`Missing from DB: ${missingRows.length}`);
    console.log(`Missing export: ${missingPath}`);
  } else {
    console.log("DB comparison skipped because Supabase credentials are not configured.");
    console.log("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable DB reconciliation.");
  }
  console.log("--- End report ---");

  process.exit(dbCompareEnabled ? 0 : 0);
}
