export type BuildModuleName =
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
  projectType: string;
  actorUserId?: string | null;
};

export type BuildModuleHealth = {
  module: BuildModuleName;
  ready: boolean;
  note: string;
};
