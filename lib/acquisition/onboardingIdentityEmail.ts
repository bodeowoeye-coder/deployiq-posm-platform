export function buildOnboardingOtpEmail(input: { email: string; otp: string; expiresInMinutes: number }) {
  return {
    to: input.email,
    subject: "Verify your DeployIQ email",
    body: [
      "Your DeployIQ verification code is:",
      "",
      input.otp,
      "",
      `This code expires in ${input.expiresInMinutes} minutes.`,
      "",
      "If you did not start this DeployIQ workspace setup, you can ignore this email.",
    ].join("\n"),
  };
}

export function buildOnboardingAccountSetupEmail(input: { email: string; setupLink: string }) {
  return {
    to: input.email,
    subject: "Secure your DeployIQ account",
    body: [
      "Your DeployIQ email has been verified.",
      "",
      "Use the secure, one-time link below to create your password and continue your workspace setup:",
      "",
      input.setupLink,
      "",
      "If you did not start this DeployIQ workspace setup, you can ignore this email.",
    ].join("\n"),
  };
}
