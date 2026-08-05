/**
 * Provisioning anticipation step definitions.
 * Extracted to a plain .ts file so tests can import without requiring JSX/TSX support.
 * No React dependencies.
 */

export const PREPARATION_STEPS = [
  "Confirming your subscription",
  "Preparing your workspace configuration",
  "Applying your selected DeployIQ product",
  "Preparing your administrator profile",
  "Getting your workspace ready for setup",
] as const;

export const FINAL_MESSAGE = "Everything is ready for workspace setup.";
