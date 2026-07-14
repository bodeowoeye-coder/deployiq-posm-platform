export type BuildModuleName =
  | "sites"
  | "activities"
  | "supplies"
  | "progress"
  | "documents"
  | "site-diary"
  | "inspections"
  | "quality-assurance"
  | "health-safety"
  | "assets"
  | "equipment";

export type BuildModuleContext = {
  projectId: string;
  siteId: string | null;
  projectType: string;
  actor: {
    userId: string;
    role: "admin" | "client" | "installer";
    clientId: string | null;
  };
};

export type BuildModuleHealth = {
  module: BuildModuleName;
  ready: boolean;
  note: string;
};
