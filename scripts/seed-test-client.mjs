import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || "Test1234!";
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.com";
const DEFAULT_ADMIN_FULL_NAME = process.env.ADMIN_FULL_NAME || "Test Admin";
const DEFAULT_INSTALLER_EMAIL = process.env.INSTALLER_EMAIL || "installer@test.com";
const DEFAULT_INSTALLER_FULL_NAME = process.env.INSTALLER_FULL_NAME || "Test Installer";
const DEFAULT_INSTALLER_ROLE = process.env.INSTALLER_ROLE || "installer";
const DEFAULT_CLIENT_EMAIL = process.env.CLIENT_EMAIL || "darling@test.com";
const DEFAULT_CLIENT_FULL_NAME = process.env.CLIENT_FULL_NAME || "Godrej Nigeria Ltd Client";
const CLIENT_NAME = process.env.CLIENT_NAME || "Godrej Nigeria Ltd";
const CLIENT_CONTACT_NAME = process.env.CLIENT_CONTACT_NAME || "Godrej Nigeria Ltd Admin";
const SEED_TYPE = process.argv[2] || process.env.SEED_TYPE || "godrej-client";
const GODREJ_BRANDS = ["Darling", "MegaGrowth", "TURA", "FreshGlow", "GK"];
const GODREJ_PROJECTS = [
  { brandName: "Darling", projectName: "Salon Dealer Board for Godrej", campaignName: "Salon Dealer Board" },
  { brandName: "MegaGrowth", projectName: "MegaGrowth Retail Push", campaignName: "MegaGrowth Activation" }
];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function normalizeName(name) {
  return String(name).trim() || "Test User";
}

function isMissingTableError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

async function tableExists(tableName) {
  const { error } = await supabase.from(tableName).select("*").limit(1);
  if (error) {
    if (isMissingTableError(error)) {
      return false;
    }
    throw new Error(`Failed to check table ${tableName}: ${error.message}`);
  }
  return true;
}

async function findAuthUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(`Failed to list auth users: ${error.message}`);
  }

  return data.users.find((user) => normalizeEmail(user.email) === email) ?? null;
}

async function getOrCreateClient(clientName) {
  const { data: existingClient, error: clientQueryError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("name", clientName)
    .maybeSingle();

  if (clientQueryError) {
    throw new Error(`Failed to query clients: ${clientQueryError.message}`);
  }

  if (existingClient) {
    return existingClient;
  }

  const { data: createdClient, error: createError } = await supabase
    .from("clients")
    .insert({ name: clientName, can_review: false })
    .select("id, name")
    .single();

  if (createError) {
    throw new Error(`Failed to create test client: ${createError.message}`);
  }

  return createdClient;
}

async function ensureBrandsForClient(clientId, brandNames) {
  const exists = await tableExists("brands");
  if (!exists) {
    console.warn("Skipping brand seed because the brands table does not exist.");
    return;
  }

  for (const brandName of brandNames) {
    const { error } = await supabase
      .from("brands")
      .upsert({ client_id: clientId, brand_name: brandName }, { onConflict: "brand_name" });

    if (error) {
      throw new Error(`Failed to upsert brand ${brandName}: ${error.message}`);
    }
  }
}

async function ensureGodrejProjects(clientId) {
  const projectTableExists = await tableExists("projects");
  if (!projectTableExists) {
    console.warn("Skipping project seed because the projects table does not exist.");
    return;
  }

  for (const project of GODREJ_PROJECTS) {
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id")
      .eq("client_id", clientId)
      .eq("brand_name", project.brandName)
      .maybeSingle();

    if (brandError) {
      throw new Error(`Failed to resolve brand ${project.brandName}: ${brandError.message}`);
    }

    const { error } = await supabase
      .from("projects")
      .upsert(
        {
          client_id: clientId,
          brand_id: brand?.id ?? null,
          project_name: project.projectName,
          campaign_name: project.campaignName,
          target_quantity: 0,
          status: "Active",
          regions_covered: [],
          assigned_installers: []
        },
        { onConflict: "client_id,project_name" }
      );

    if (error) {
      throw new Error(`Failed to upsert project ${project.projectName}: ${error.message}`);
    }
  }
}

async function upsertClientProfile(clientId, email) {
  const exists = await tableExists("client_profiles");
  if (!exists) {
    console.warn("Skipping client_profiles seed because the table does not exist.");
    return false;
  }

  const payload = {
    client_id: clientId,
    contact_person: CLIENT_CONTACT_NAME,
    email,
    phone: null
  };

  const { error } = await supabase
    .from("client_profiles")
    .upsert(payload, { onConflict: "client_id" });

  if (error) {
    throw new Error(`Failed to upsert client profile: ${error.message}`);
  }

  return true;
}

async function upsertUserProfile(userId, email, fullName) {
  const exists = await tableExists("user_profiles");
  if (!exists) {
    console.warn("Skipping user_profiles seed because the table does not exist.");
    return false;
  }

  const profilePayload = {
    user_id: userId,
    full_name: fullName,
    email,
    phone: null,
    agency_id: null,
    assigned_project_ids: [],
    assigned_regions: [],
    assigned_states: [],
    status: "Active"
  };

  const { error } = await supabase
    .from("user_profiles")
    .upsert(profilePayload, { onConflict: "user_id" });

  if (error) {
    throw new Error(`Failed to upsert user profile: ${error.message}`);
  }

  return true;
}

async function upsertUserRole(userId, clientId, desiredRole = "client") {
  const exists = await tableExists("user_roles");
  if (!exists) {
    console.warn("Skipping user_roles seed because the table does not exist.");
    return null;
  }

  const existingRoleResult = await supabase
    .from("user_roles")
    .select("user_id, role, client_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingRoleResult.error) {
    throw new Error(`Failed to load existing user role: ${existingRoleResult.error.message}`);
  }

  const existingRole = existingRoleResult.data;
  const payload = {
    user_id: userId,
    role: desiredRole,
    client_id: clientId
  };

  if (existingRole) {
    if (existingRole.role === desiredRole && existingRole.client_id === clientId) {
      return existingRole;
    }
    const { error } = await supabase
      .from("user_roles")
      .update(payload)
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Failed to update user role: ${error.message}`);
    }

    return payload;
  }

  const { data: roleData, error: insertError } = await supabase
    .from("user_roles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, role, client_id")
    .maybeSingle();

  if (insertError) {
    throw new Error(`Failed to create user role: ${insertError.message}`);
  }

  return roleData ?? payload;
}

async function run() {
  const seedType = String(SEED_TYPE).trim().toLowerCase();
  const isAdmin = seedType === "admin";
  const isInstaller = seedType === "installer";
  const isGodrejClient = seedType === "godrej-client" || seedType === "darling-client" || seedType === "client";
  const email = normalizeEmail(
    isAdmin
      ? DEFAULT_ADMIN_EMAIL
      : isInstaller
        ? DEFAULT_INSTALLER_EMAIL
        : isGodrejClient
          ? process.env.CLIENT_EMAIL || "darling@test.com"
          : DEFAULT_CLIENT_EMAIL
  );
  const password = DEFAULT_PASSWORD;
  const fullName = isAdmin
    ? DEFAULT_ADMIN_FULL_NAME
    : isInstaller
      ? DEFAULT_INSTALLER_FULL_NAME
      : isGodrejClient
        ? process.env.CLIENT_FULL_NAME || "Godrej Nigeria Ltd Client"
        : DEFAULT_CLIENT_FULL_NAME;
  const desiredRole = isAdmin ? "admin" : isInstaller ? DEFAULT_INSTALLER_ROLE : "client";
  const clientName = isGodrejClient ? process.env.CLIENT_NAME || "Godrej Nigeria Ltd" : CLIENT_NAME;

  console.log(`Seeding local ${isAdmin ? "admin" : isInstaller ? "installer" : "client"} user for email: ${email}`);

  let authUser = await findAuthUserByEmail(email);

  if (!authUser) {
    console.log("Auth user not found. Creating new auth user...");
    const createResult = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (createResult.error) {
      throw new Error(`Failed to create auth user: ${createResult.error.message}`);
    }

    authUser = createResult.data.user;
    console.log(`Created auth user with id: ${authUser.id}`);
  } else {
    console.log(`Found existing auth user with id: ${authUser.id}`);
    const updateResult = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (updateResult.error) {
      throw new Error(`Failed to update auth user: ${updateResult.error.message}`);
    }
    authUser = updateResult.data.user;
    console.log(`Updated auth user settings for id: ${authUser.id}`);
  }

  if (isAdmin) {
    const profileCreated = await upsertUserProfile(authUser.id, email, fullName);
    if (profileCreated) {
      console.log("Admin profile upserted.");
    } else {
      console.log("Admin profile skipped.");
    }

    const role = await upsertUserRole(authUser.id, null, desiredRole);
    if (role) {
      console.log(`Admin role ensured: ${role.role} (client_id=${role.client_id})`);
    } else {
      console.log("Admin role skipped.");
    }

    console.log("Admin seed complete.");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    return;
  }

  if (isInstaller) {
    const profileCreated = await upsertUserProfile(authUser.id, email, fullName);
    if (profileCreated) {
      console.log("Installer profile upserted.");
    } else {
      console.log("Installer profile skipped.");
    }

    const role = await upsertUserRole(authUser.id, null, desiredRole);
    if (role) {
      console.log(`Installer role ensured: ${role.role} (client_id=${role.client_id})`);
    } else {
      console.log("Installer role skipped.");
    }

    console.log("Installer seed complete.");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    return;
  }

  const client = await getOrCreateClient(clientName);
  console.log(`Using client: ${client.name} (${client.id})`);

  if (client.name === "Godrej Nigeria Ltd") {
    await ensureBrandsForClient(client.id, GODREJ_BRANDS);
    await ensureGodrejProjects(client.id);
    console.log(`Godrej brand mappings ensured: ${GODREJ_BRANDS.join(", ")}`);
    console.log(`Godrej projects ensured: ${GODREJ_PROJECTS.map((project) => project.projectName).join(", ")}`);
  }

  const clientProfileCreated = await upsertClientProfile(client.id, email);
  if (clientProfileCreated) {
    console.log("Client profile upserted.");
  } else {
    console.log("Client profile skipped.");
  }

  const userProfileCreated = await upsertUserProfile(authUser.id, email, fullName);
  if (userProfileCreated) {
    console.log("User profile upserted.");
  } else {
    console.log("User profile skipped.");
  }

  const role = await upsertUserRole(authUser.id, client.id, desiredRole);
  if (role) {
    console.log(`User role ensured: ${role.role} (client_id=${role.client_id})`);
  } else {
    console.log("User role skipped.");
  }

  console.log("Seed complete.");
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

run().catch((error) => {
  console.error("Seed script failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
