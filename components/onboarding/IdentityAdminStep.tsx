"use client";

import { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import {
  validateName,
  validateBusinessEmail,
  validateMobile,
  analysePassword,
  validatePasswordMatch,
  type PasswordAnalysis,
} from "@/lib/acquisition/identity";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import { WorkspacePreview } from "./WorkspacePreview";
import type { IdentityOrgData } from "./IdentityOrganisationStep";

export type IdentityAdminData = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  passwordMethod: "generated" | "customer_created";
  password?: string;
  confirmPassword?: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  /** ISO timestamp when terms were accepted — set on submit. */
  acceptedTermsAt?: string;
  /** ISO timestamp when privacy policy was accepted — set on submit. */
  acceptedPrivacyAt?: string;
};

type Props = {
  initialData: IdentityAdminData;
  orgData: IdentityOrgData;
  recommendation: RecommendationResult | null;
  quotation: CustomerQuotation | null;
  onSubmit: (data: IdentityAdminData) => void;
  onBack: () => void;
};

const inputClass =
  "block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

const STRENGTH_COLOURS = ["bg-rose-400", "bg-amber-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-500"];

function PasswordMeter({ analysis }: { analysis: PasswordAnalysis }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= analysis.score - 1 ? STRENGTH_COLOURS[analysis.score] : "bg-slate-100"
          }`} />
        ))}
        <span className={`text-xs font-medium ml-1 ${
          analysis.score >= 3 ? "text-emerald-600" : analysis.score >= 2 ? "text-amber-600" : "text-rose-600"
        }`}>
          {analysis.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {[
          { key: "hasMinLength",  label: "8+ characters" },
          { key: "hasUppercase",  label: "Uppercase letter" },
          { key: "hasLowercase",  label: "Lowercase letter" },
          { key: "hasNumber",     label: "Number" },
          { key: "hasSpecial",    label: "Special character" },
        ].map(({ key, label }) => (
          <span key={key} className={`text-xs ${
            analysis[key as keyof PasswordAnalysis] ? "text-emerald-600" : "text-slate-400"
          }`}>
            {analysis[key as keyof PasswordAnalysis] ? "✓" : "○"} {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function IdentityAdminStep({
  initialData, orgData, recommendation, quotation, onSubmit, onBack,
}: Props) {
  const [form, setForm] = useState<IdentityAdminData>(initialData);
  const [password, setPassword] = useState(initialData.password ?? "");
  const [confirmPassword, setConfirmPassword] = useState(initialData.confirmPassword ?? "");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pwAnalysis, setPwAnalysis] = useState<PasswordAnalysis>(analysePassword(initialData.password ?? ""));

  function patchField(field: keyof IdentityAdminData, value: string | boolean) {
    setForm((c) => ({ ...c, [field]: value }));
    setErrors((c) => ({ ...c, [field]: undefined }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const fnErr = validateName(form.firstName, "First name");
    if (fnErr) next.firstName = fnErr;
    const lnErr = validateName(form.lastName, "Last name");
    if (lnErr) next.lastName = lnErr;
    const emailErr = validateBusinessEmail(form.email);
    if (emailErr) next.email = emailErr;
    const mobileErr = validateMobile(form.mobile);
    if (mobileErr) next.mobile = mobileErr;
    if (form.passwordMethod === "customer_created") {
      if (!pwAnalysis.isAcceptable) next.password = "Password does not meet requirements.";
      const matchErr = validatePasswordMatch(password, confirmPassword);
      if (matchErr) next.confirmPassword = matchErr;
    }
    if (!form.acceptedTerms) next.terms = "You must accept the Terms of Service.";
    if (!form.acceptedPrivacy) next.privacy = "You must accept the Privacy Policy.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const now = new Date().toISOString();
    onSubmit({
      ...form,
      password: form.passwordMethod === "customer_created" ? password : undefined,
      confirmPassword: form.passwordMethod === "customer_created" ? confirmPassword : undefined,
      acceptedTermsAt: form.acceptedTerms ? now : undefined,
      acceptedPrivacyAt: form.acceptedPrivacy ? now : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate autoComplete="on">
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Main form */}
        <div className="space-y-8 min-w-0">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              Workspace Setup — Step 2 of 4
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Create your administrator account
            </h1>
            <p className="text-base text-slate-500 leading-relaxed">
              This account will have full administrative access to your DeployIQ workspace.
            </p>
          </div>

          <div className="space-y-5">
            {/* Name row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="adm-fn" className="block text-sm font-medium text-slate-700">
                  First name <span className="text-rose-500" aria-hidden="true">*</span>
                </label>
                <input id="adm-fn" name="given-name" type="text" value={form.firstName}
                  onChange={(e) => patchField("firstName", e.target.value)}
                  className={inputClass} placeholder="John"
                  autoComplete="given-name" />
                {errors.firstName ? <p className="text-xs text-rose-600" role="alert">{errors.firstName}</p> : null}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="adm-ln" className="block text-sm font-medium text-slate-700">
                  Last name <span className="text-rose-500" aria-hidden="true">*</span>
                </label>
                <input id="adm-ln" name="family-name" type="text" value={form.lastName}
                  onChange={(e) => patchField("lastName", e.target.value)}
                  className={inputClass} placeholder="Doe"
                  autoComplete="family-name" />
                {errors.lastName ? <p className="text-xs text-rose-600" role="alert">{errors.lastName}</p> : null}
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="adm-email" className="block text-sm font-medium text-slate-700">
                Business email <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <input id="adm-email" name="email" type="email" value={form.email}
                onChange={(e) => patchField("email", e.target.value)}
                className={inputClass} placeholder="john@yourcompany.com"
                autoComplete="email" aria-describedby="adm-email-hint" />
              <p id="adm-email-hint" className="text-xs text-slate-400">
                A verification code will be sent here.
              </p>
              {errors.email ? <p className="text-xs text-rose-600" role="alert">{errors.email}</p> : null}
            </div>

            {/* Mobile */}
            <div className="space-y-1.5">
              <label htmlFor="adm-mobile" className="block text-sm font-medium text-slate-700">
                Mobile number <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <input id="adm-mobile" name="tel" type="tel" value={form.mobile}
                onChange={(e) => patchField("mobile", e.target.value)}
                className={inputClass} placeholder="+234 800 000 0000"
                autoComplete="tel" />
              {errors.mobile ? <p className="text-xs text-rose-600" role="alert">{errors.mobile}</p> : null}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Password setup</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  form.passwordMethod === "generated" ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300"
                }`}>
                  <input
                    type="radio"
                    name="passwordMethod"
                    value="generated"
                    checked={form.passwordMethod === "generated"}
                    onChange={() => patchField("passwordMethod", "generated")}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold text-slate-900">Let DeployIQ create a secure password</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                    DeployIQ generates a temporary password after verification. You will change it on first sign-in.
                  </span>
                </label>
                <label className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  form.passwordMethod === "customer_created" ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300"
                }`}>
                  <input
                    type="radio"
                    name="passwordMethod"
                    value="customer_created"
                    checked={form.passwordMethod === "customer_created"}
                    onChange={() => patchField("passwordMethod", "customer_created")}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold text-slate-900">I'll create my own password</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                    Use your own password now. You will sign in with it after email verification.
                  </span>
                </label>
              </div>
            </div>

            {form.passwordMethod === "customer_created" ? (
              <>
            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="adm-pw" className="block text-sm font-medium text-slate-700">
                Password <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <div className="relative">
                <input id="adm-pw" name="new-password" type={showPw ? "text" : "password"} value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPwAnalysis(analysePassword(e.target.value));
                    setErrors((c) => ({ ...c, password: undefined }));
                  }}
                  className={`${inputClass} pr-10`} placeholder="Create a strong password"
                  autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password ? <PasswordMeter analysis={pwAnalysis} /> : null}
              {errors.password ? <p className="text-xs text-rose-600" role="alert">{errors.password}</p> : null}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label htmlFor="adm-pw2" className="block text-sm font-medium text-slate-700">
                Confirm password <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <div className="relative">
                <input id="adm-pw2" name="confirm-password" type={showConfirm ? "text" : "password"} value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setErrors((c) => ({ ...c, confirmPassword: undefined }));
                  }}
                  className={`${inputClass} pr-10`} placeholder="Repeat your password"
                  autoComplete="new-password" />
                <button type="button" onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword ? <p className="text-xs text-rose-600" role="alert">{errors.confirmPassword}</p> : null}
            </div>
              </>
            ) : null}

            {/* Terms */}
            <div className="space-y-2.5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="acceptedTerms"
                  checked={Boolean(form.acceptedTerms)}
                  onChange={(e) => patchField("acceptedTerms", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-orange-500"
                />
                <span className="text-sm text-slate-600">
                  I agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-900 underline underline-offset-2 hover:text-orange-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Terms of Service
                  </a>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="acceptedPrivacy"
                  checked={Boolean(form.acceptedPrivacy)}
                  onChange={(e) => patchField("acceptedPrivacy", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-orange-500"
                />
                <span className="text-sm text-slate-600">
                  I acknowledge the{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-900 underline underline-offset-2 hover:text-orange-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Privacy Policy
                  </a>
                </span>
              </label>
              {errors.terms ? <p className="text-xs text-rose-600" role="alert">{errors.terms}</p> : null}
              {errors.privacy ? <p className="text-xs text-rose-600" role="alert">{errors.privacy}</p> : null}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <button type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors">
              Send verification code
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="hidden lg:block">
          <WorkspacePreview
            organisationName={orgData.organisationName}
            workspaceName={orgData.workspaceName || orgData.organisationName}
            workspaceSlug={orgData.workspaceSlug}
            adminFirstName={form.firstName}
            adminLastName={form.lastName}
            adminEmail={form.email}
            recommendation={recommendation}
            quotation={quotation}
          />
        </div>
      </div>
    </form>
  );
}
