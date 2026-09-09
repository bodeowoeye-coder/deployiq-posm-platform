export const BUILD_INTELLIGENCE_UNSUPPORTED_CONCLUSIONS = [
  "root_cause", "critical_path", "physical_progress", "productivity", "efficiency", "earned_value", "spi", "cpi",
  "predicted_completion", "forecast_delay", "delay_probability", "financial_impact", "employee_ranking", "contractor_ranking",
  "delay_attribution", "causality", "blame", "project_health_score",
] as const;

export type BuildUnsupportedConclusion = typeof BUILD_INTELLIGENCE_UNSUPPORTED_CONCLUSIONS[number];
