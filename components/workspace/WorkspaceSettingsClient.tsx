"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Bell,
  ChevronRight,
  Copy,
  CreditCard,
  KeyRound,
  Link2,
  LockKeyhole,
  Palette,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { CustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";

type Props = {
  workspace: CustomerWorkspaceContext;
  initialSection?: SettingsSection;
};

export type SettingsSection =
  | "home"
  | "general"
  | "appearance"
  | "branding"
  | "security"
  | "notifications"
  | "access"
  | "billing"
  | "integrations";

const settingsSections: Array<{
  key: Exclude<SettingsSection, "home">;
  title: string;
  description: string;
  summary: string;
  href: string;
  icon: typeof Settings;
}> = [
  {
    key: "general",
    title: "General",
    description: "Workspace identity, timezone, date format and landing page.",
    summary: "Workspace basics",
    href: "/workspace/admin/workspace-settings/general",
    icon: SlidersHorizontal,
  },
  {
    key: "appearance",
    title: "Appearance",
    description: "Theme, font size and layout density for your account.",
    summary: "Personal preference",
    href: "/workspace/admin/workspace-settings/appearance",
    icon: Palette,
  },
  {
    key: "branding",
    title: "Branding",
    description: "Workspace logo, report logo and accent colour.",
    summary: "Workspace-wide",
    href: "/workspace/admin/workspace-settings/branding",
    icon: ShieldCheck,
  },
  {
    key: "security",
    title: "Account & Security",
    description: "Password, sessions, authentication and signature settings.",
    summary: "Authenticated account",
    href: "/workspace/admin/workspace-settings/security",
    icon: LockKeyhole,
  },
  {
    key: "notifications",
    title: "Notifications",
    description: "Email and in-workspace notification preferences.",
    summary: "Workspace updates",
    href: "/workspace/admin/workspace-settings/notifications",
    icon: Bell,
  },
  {
    key: "access",
    title: "Users & Permissions",
    description: "Roles, team access and workspace permissions.",
    summary: "Team management",
    href: "/workspace/admin/workspace-settings/access",
    icon: UsersRound,
  },
  {
    key: "billing",
    title: "Billing & Plan",
    description: "Subscription, commercial plan and product entitlement.",
    summary: "Commercial plan",
    href: "/workspace/admin/workspace-settings/billing",
    icon: CreditCard,
  },
  {
    key: "integrations",
    title: "Integrations",
    description: "Future integrations and API connections.",
    summary: "Coming later",
    href: "/workspace/admin/workspace-settings/integrations",
    icon: Link2,
  },
];

const fileTypes = ["image/png", "image/jpeg", "image/svg+xml"];
const maxLogoSize = 1_000_000;
type AppearancePreferences = {
  themePreference: string;
  fontSize: string;
  density: string;
};

const defaultAppearance: AppearancePreferences = {
  themePreference: "system",
  fontSize: "default",
  density: "comfortable",
};

export function customerWorkspaceAppearanceKey(userId: string) {
  return `deployiq:cw:appearance:${userId}`;
}

function validTheme(value: unknown) {
  return value === "light" || value === "dark" || value === "system" ? value : defaultAppearance.themePreference;
}

function validFontSize(value: unknown) {
  return value === "small" || value === "default" || value === "large" ? value : defaultAppearance.fontSize;
}

function validDensity(value: unknown) {
  return value === "compact" || value === "comfortable" ? value : defaultAppearance.density;
}

export function readCustomerWorkspaceAppearance(userId: string): AppearancePreferences {
  try {
    const saved = localStorage.getItem(customerWorkspaceAppearanceKey(userId));
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AppearancePreferences>;
      return {
        themePreference: validTheme(parsed.themePreference),
        fontSize: validFontSize(parsed.fontSize),
        density: validDensity(parsed.density),
      };
    }
  } catch {
    // Corrupt appearance preferences should fall back without blocking workspace rendering.
  }

  return defaultAppearance;
}

export function writeCustomerWorkspaceAppearance(userId: string, preferences: AppearancePreferences) {
  localStorage.setItem(customerWorkspaceAppearanceKey(userId), JSON.stringify(preferences));
}

export function applyCustomerWorkspaceAppearance(preferences: AppearancePreferences) {
  const html = document.documentElement;
  const applyTheme = () => {
    if (preferences.themePreference === "dark") html.dataset.theme = "dark";
    else if (preferences.themePreference === "light") delete html.dataset.theme;
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) html.dataset.theme = "dark";
    else delete html.dataset.theme;
  };
  applyTheme();
  html.dataset.workspaceThemePreference = preferences.themePreference;
  html.dataset.workspaceFontSize = preferences.fontSize;
  html.dataset.workspaceDensity = preferences.density;
}

export function WorkspaceSettingsClient({ workspace, initialSection = "home" }: Props) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [themeMode, setThemeMode] = useState("system");
  const [fontSize, setFontSize] = useState("default");
  const [density, setDensity] = useState("comfortable");
  const [logoPreview, setLogoPreview] = useState<string | null>(workspace.branding.logoUrl);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const activeTitle = activeSection === "home"
    ? "Workspace Settings"
    : settingsSections.find((section) => section.key === activeSection)?.title ?? "Workspace Settings";

  useEffect(() => {
    const saved = readCustomerWorkspaceAppearance(workspace.userId);
    setThemeMode(saved.themePreference);
    setFontSize(saved.fontSize);
    setDensity(saved.density);
    applyCustomerWorkspaceAppearance(saved);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      const current = readCustomerWorkspaceAppearance(workspace.userId);
      if (current.themePreference === "system") applyCustomerWorkspaceAppearance(current);
    };
    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, [workspace.userId]);

  function saveAppearance(nextTheme = themeMode, nextFontSize = fontSize, nextDensity = density) {
    const next = {
      themePreference: validTheme(nextTheme),
      fontSize: validFontSize(nextFontSize),
      density: validDensity(nextDensity),
    };
    writeCustomerWorkspaceAppearance(workspace.userId, next);
    applyCustomerWorkspaceAppearance(next);
  }

  function openSection(section: SettingsSection) {
    setActiveSection(section);
  }

  async function copyCustomerId() {
    await navigator.clipboard.writeText(workspace.customerId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function handleLogo(file: File | null) {
    setLogoMessage(null);
    if (!file) return;
    if (!fileTypes.includes(file.type)) {
      setLogoMessage("Use a PNG, JPG or SVG logo.");
      return;
    }
    if (file.size > maxLogoSize) {
      setLogoMessage("Logo file must be 1 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function resetLogo() {
    setLogoPreview(null);
    setLogoMessage("Logo reset to workspace initials. Saving will use the workspace branding service.");
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  return (
    <div className="workspace-settings space-y-6">
      <section className="workspace-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="workspace-eyebrow">Workspace Settings</p>
            <h2 className="mt-2 text-2xl font-bold">{activeTitle}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Manage your workspace preferences, branding, security, notifications and access.
            </p>
          </div>
          <div className="workspace-subtle-card flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace ID</p>
              <p className="mt-1 font-mono text-xs font-bold text-slate-900">{workspace.customerId}</p>
            </div>
            <button
              type="button"
              onClick={copyCustomerId}
              className="workspace-button-tertiary min-h-9 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </section>

      {activeSection === "home" ? <SettingsHome onOpen={openSection} /> : null}

      {activeSection !== "home" ? (
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="workspace-card p-3">
            <nav className="grid gap-1" aria-label="Settings navigation">
              <Link href="/workspace/admin/workspace-settings" prefetch onClick={() => openSection("home")} className="workspace-settings-link">
                Settings Home
              </Link>
              {settingsSections.map((section) => (
                <Link
                  key={section.key}
                  href={section.href}
                  prefetch
                  onClick={() => openSection(section.key)}
                  aria-current={activeSection === section.key ? "page" : undefined}
                  className={`workspace-settings-link ${activeSection === section.key ? "workspace-settings-link-active" : ""}`}
                >
                  {section.title}
                </Link>
              ))}
            </nav>
          </aside>

          <section className="workspace-card p-6">
            {activeSection === "general" ? <GeneralSection workspace={workspace} /> : null}
            {activeSection === "appearance" ? (
              <AppearanceSection
                themeMode={themeMode}
                fontSize={fontSize}
                density={density}
                setThemeMode={setThemeMode}
                setFontSize={setFontSize}
                setDensity={setDensity}
                saveAppearance={saveAppearance}
              />
            ) : null}
            {activeSection === "branding" ? (
              <BrandingSection
                workspace={workspace}
                logoPreview={logoPreview}
                logoMessage={logoMessage}
                logoInputRef={logoInputRef}
                handleLogo={handleLogo}
                resetLogo={resetLogo}
              />
            ) : null}
            {activeSection === "security" ? <SecuritySection workspace={workspace} /> : null}
            {activeSection === "notifications" ? <NotificationsSection /> : null}
            {activeSection === "access" ? <AccessSection workspace={workspace} /> : null}
            {activeSection === "billing" ? <BillingSection workspace={workspace} /> : null}
            {activeSection === "integrations" ? <IntegrationsSection /> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SettingsHome({ onOpen }: { onOpen: (section: SettingsSection) => void }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {settingsSections.map((section) => {
        const Icon = section.icon;
        return (
          <Link
            key={section.key}
            href={section.href}
            prefetch
            onClick={() => onOpen(section.key)}
            className="workspace-card group flex min-h-44 flex-col justify-between p-5 hover:border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="mt-5 block text-base font-bold text-slate-950">{section.title}</span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">{section.description}</span>
            </span>
            <span className="mt-4 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-500">
              {section.summary}
              <ChevronRight className="h-4 w-4 text-orange-600" aria-hidden="true" />
            </span>
          </Link>
        );
      })}
    </section>
  );
}

function GeneralSection({ workspace }: { workspace: CustomerWorkspaceContext }) {
  return (
    <Section title="General" description="Workspace identity, timezone, date format and default landing page.">
      <Info label="Workspace display name" value={workspace.workspaceName} />
      <Info label="Organisation" value={workspace.organisationName} />
      <Info label="Workspace URL" value={workspace.workspaceUrl} />
      <Info label="Default timezone" value="Africa/Lagos" />
      <Info label="Date format" value="DD MMM YYYY" />
      <Info label="Default landing page" value="Workspace Home" />
    </Section>
  );
}

function AppearanceSection(props: {
  themeMode: string;
  fontSize: string;
  density: string;
  setThemeMode: (value: string) => void;
  setFontSize: (value: string) => void;
  setDensity: (value: string) => void;
  saveAppearance: (theme?: string, fontSize?: string, density?: string) => void;
}) {
  return (
    <Section title="Appearance" description="These personal preferences are saved for your account in this browser and do not change other users' workspace settings.">
      <ChoiceGroup label="Theme" value={props.themeMode} options={["light", "dark", "system"]} onChange={(value) => { props.setThemeMode(value); props.saveAppearance(value, props.fontSize, props.density); }} />
      <ChoiceGroup label="Font size" value={props.fontSize} options={["small", "default", "large"]} onChange={(value) => { props.setFontSize(value); props.saveAppearance(props.themeMode, value, props.density); }} />
      <ChoiceGroup label="Density" value={props.density} options={["compact", "comfortable"]} onChange={(value) => { props.setDensity(value); props.saveAppearance(props.themeMode, props.fontSize, value); }} />
    </Section>
  );
}

function BrandingSection(props: {
  workspace: CustomerWorkspaceContext;
  logoPreview: string | null;
  logoMessage: string | null;
  logoInputRef: RefObject<HTMLInputElement>;
  handleLogo: (file: File | null) => void;
  resetLogo: () => void;
}) {
  return (
    <Section title="Branding" description="Workspace-wide branding for the admin workspace and customer-facing reports.">
      <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
        <div className="workspace-subtle-card flex h-36 w-36 items-center justify-center overflow-hidden p-4 text-3xl font-black text-slate-700">
          {props.logoPreview ? <img src={props.logoPreview} alt={`${props.workspace.organisationName} logo preview`} className="max-h-full rounded-lg object-contain" /> : props.workspace.branding.workspaceInitials}
        </div>
        <div className="grid gap-4">
          <Info label="Workspace display name" value={props.workspace.workspaceName} />
          <Info label="Accent colour" value={props.workspace.branding.accentColour} />
          <Info label="Report logo" value="Uses the workspace branding record when report branding is enabled." />
          <input ref={props.logoInputRef} aria-label="Upload organisation logo" type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" onChange={(event) => props.handleLogo(event.target.files?.[0] ?? null)} className="workspace-input block w-full py-2" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => props.logoInputRef.current?.click()} className="workspace-button-primary">Replace logo</button>
            <button type="button" onClick={props.resetLogo} className="workspace-button-tertiary">Remove/reset logo</button>
          </div>
          {props.logoMessage ? <p role="status" className="text-sm font-semibold text-amber-700">{props.logoMessage}</p> : null}
        </div>
      </div>
    </Section>
  );
}

function SecuritySection({ workspace }: { workspace: CustomerWorkspaceContext }) {
  return (
    <Section title="Account & Security" description="Manage your authenticated account, password and security preferences.">
      <Info label="Email address" value={workspace.email ?? "Not available"} />
      <Info label="Primary administrator" value={workspace.isPrimaryAdministrator ? "Yes" : "No"} />
      <Info label="Two-factor authentication" value="Not enabled" />
      <Info label="Last successful sign-in" value="Not available" />
      <div className="flex flex-wrap gap-2">
        <Link href="/workspace/admin/workspace-settings/security#change-password" className="workspace-button-secondary">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Change Password
        </Link>
        <button type="button" className="workspace-button-tertiary">Sign Out Other Sessions</button>
      </div>
      <div id="change-password" className="workspace-subtle-card p-4">
        <p className="text-sm font-bold text-slate-950">Password change</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Voluntary password changes use this authenticated security area. First-login temporary-password replacement remains separate.
        </p>
      </div>
      <Info label="Signature reset" value="Signature service is not connected yet. Reset requires confirmation when integrated." />
      <button type="button" aria-disabled="true" className="workspace-button-tertiary text-slate-500">Reset signature unavailable</button>
    </Section>
  );
}

function NotificationsSection() {
  return (
    <Section title="Notifications" description="Choose the workspace updates you want to receive.">
      {["Email notifications", "Workspace notifications", "Project updates", "Deployment alerts", "Rejection alerts", "Completion alerts", "Security alerts"].map((item) => (
        <label key={item} className="workspace-subtle-card flex min-h-11 items-center justify-between px-3 text-sm font-semibold text-slate-700">
          {item}
          <input type="checkbox" defaultChecked={item === "Security alerts" || item === "Workspace notifications"} disabled={item === "Security alerts"} />
        </label>
      ))}
    </Section>
  );
}

function AccessSection({ workspace }: { workspace: CustomerWorkspaceContext }) {
  return (
    <Section title="Users & Permissions" description="Review team access, roles and workspace permissions.">
      <Info label="Current membership" value={membershipLabel(workspace.membershipRoleKey)} />
      <Info label="Role" value={roleLabel(workspace.role)} />
      <Info label="Permission summary" value="Full workspace administrator access" />
      <Info label="Primary administrator status" value={workspace.isPrimaryAdministrator ? "Primary Administrator" : "Workspace member"} />
      <Link href="/workspace/admin/team" className="workspace-button-primary w-fit">Open Teams & Users</Link>
    </Section>
  );
}

function BillingSection({ workspace }: { workspace: CustomerWorkspaceContext }) {
  return (
    <Section title="Billing & Plan" description="Review your active subscription and commercial plan.">
      <Info label="Product" value={workspace.productName} />
      <Info label="Plan" value={workspace.planName} />
      <Info label="Workspace status" value={workspace.activationStatus} />
      <Link href="/workspace/admin/billing" className="workspace-button-tertiary w-fit">Open billing overview</Link>
    </Section>
  );
}

function IntegrationsSection() {
  return (
    <Section title="Integrations" description="Future integrations and API connections will be managed here.">
      <Info label="Available integrations" value="None enabled yet" />
      <Info label="API connections" value="Coming later" />
    </Section>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-slate-950">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-6 grid gap-4">{children}</div>
    </div>
  );
}

function ChoiceGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="text-sm font-bold text-slate-950">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`workspace-button-tertiary capitalize focus:outline-none focus:ring-2 focus:ring-orange-200 ${
              value === option ? "workspace-settings-link-active" : ""
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="workspace-subtle-card p-4">
      <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function roleLabel(role: string) {
  if (role === "customer_admin") return "Customer Administrator";
  if (role === "workspace_manager") return "Workspace Manager";
  if (role === "agency_manager") return "Agency Manager";
  if (role === "installer") return "Installer";
  if (role === "client_viewer") return "Client Viewer";
  return "Workspace Member";
}

function membershipLabel(roleKey: string) {
  if (roleKey === "customer_admin" || roleKey === "workspace_owner") return "Customer Administrator";
  if (roleKey === "workspace_manager" || roleKey === "workspace_administrator") return "Workspace Manager";
  if (roleKey === "project_manager") return "Project Manager";
  return roleLabel(roleKey);
}
