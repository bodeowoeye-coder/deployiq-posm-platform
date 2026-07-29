"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const steps = ["welcome", "organisation", "product", "retail-setup", "capacity", "pricing", "account", "review", "provisioning", "success"] as const;

function OnboardingContent() {
  const searchParams = useSearchParams();
  const [stepIndex, setStepIndex] = useState(0);
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [pricing, setPricing] = useState<any>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setResumeToken(token);
      fetch(`/api/onboarding/resume?token=${token}`)
        .then((res) => res.json())
        .then((payload) => setDraft(payload.draft));
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/commercial/products")
      .then((res) => res.json())
      .then((payload) => setProducts(payload.products ?? []));
  }, []);

  const currentStep = steps[stepIndex];

  const next = async () => {
    setIsLoading(true);
    setErrors([]);
    try {
      if (currentStep === "welcome") {
        const response = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "welcome", email: form.businessEmail || null })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not start onboarding.");
        setResumeToken(payload.draft.resume_token);
        setDraft(payload.draft);
        setStepIndex(1);
      } else if (currentStep === "organisation") {
        const response = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "organisation", resumeToken, ...form })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Organisation details could not be saved.");
        setDraft(payload.draft);
        setStepIndex(2);
      } else if (currentStep === "product") {
        const response = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "product", resumeToken, productKey: form.selectedProduct })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Product selection could not be saved.");
        setDraft(payload.draft);
        setStepIndex(3);
      } else if (currentStep === "retail-setup") {
        const response = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "retail-setup", resumeToken, ...form })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Retail setup could not be saved.");
        setDraft(payload.draft);
        setStepIndex(4);
      } else if (currentStep === "capacity") {
        const response = await fetch("/api/onboarding/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: form.capacity })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Pricing could not be calculated.");
        setPricing(payload.result);
        setStepIndex(5);
      } else if (currentStep === "pricing") {
        const response = await fetch("/api/onboarding/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, capacity: form.capacity, organisationName: form.organisationName, contactPerson: form.contactPerson, businessEmail: form.businessEmail, phoneNumber: form.phoneNumber, country: form.country, campaignName: form.campaignName, projectName: form.projectName, brandName: form.brandName })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Provisioning failed.");
        setDraft(payload);
        setStepIndex(9);
      }
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Unexpected error"]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return (
          <div className="space-y-6">
            <h1 className="text-3xl font-semibold">Welcome to DeployIQ</h1>
            <p className="text-slate-600">Set up your organisation and activate your first DeployIQ product.</p>
            <p className="text-slate-500">One organisation. Multiple products. One connected operational workspace.</p>
            <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={next}>Get Started</button>
          </div>
        );
      case "organisation":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Organisation Information</h2>
            <input className="w-full rounded border p-2" placeholder="Organisation Name" defaultValue={String(form.organisationName || "")} onChange={(e) => setForm((prev) => ({ ...prev, organisationName: e.target.value }))} />
            <input className="w-full rounded border p-2" placeholder="Contact Person" defaultValue={String(form.contactPerson || "")} onChange={(e) => setForm((prev) => ({ ...prev, contactPerson: e.target.value }))} />
            <input className="w-full rounded border p-2" placeholder="Business Email" defaultValue={String(form.businessEmail || "")} onChange={(e) => setForm((prev) => ({ ...prev, businessEmail: e.target.value }))} />
            <input className="w-full rounded border p-2" placeholder="Phone Number" defaultValue={String(form.phoneNumber || "")} onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))} />
            <input className="w-full rounded border p-2" placeholder="Country" defaultValue={String(form.country || "")} onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))} />
          </div>
        );
      case "product":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Activate Your First Product</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {products.map((product) => (
                <button key={product.product_key} className={`rounded border p-4 text-left ${form.selectedProduct === product.product_key ? "border-slate-900" : ""}`} onClick={() => setForm((prev) => ({ ...prev, selectedProduct: product.product_key }))}>
                  <div className="font-semibold">{product.product_name}</div>
                  <div className="text-sm text-slate-500">{product.status}</div>
                  <div className="mt-2 text-sm">{product.description}</div>
                </button>
              ))}
            </div>
          </div>
        );
      case "retail-setup":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Retail Campaign Setup</h2>
            <input className="w-full rounded border p-2" placeholder="Campaign Name" defaultValue={String(form.campaignName || "")} onChange={(e) => setForm((prev) => ({ ...prev, campaignName: e.target.value }))} />
            <input className="w-full rounded border p-2" placeholder="Project Name" defaultValue={String(form.projectName || "")} onChange={(e) => setForm((prev) => ({ ...prev, projectName: e.target.value }))} />
            <input className="w-full rounded border p-2" placeholder="Brand Name" defaultValue={String(form.brandName || "")} onChange={(e) => setForm((prev) => ({ ...prev, brandName: e.target.value }))} />
            <input type="date" className="w-full rounded border p-2" defaultValue={String(form.expectedStartDate || "")} onChange={(e) => setForm((prev) => ({ ...prev, expectedStartDate: e.target.value }))} />
            <input type="date" className="w-full rounded border p-2" defaultValue={String(form.expectedEndDate || "")} onChange={(e) => setForm((prev) => ({ ...prev, expectedEndDate: e.target.value }))} />
          </div>
        );
      case "capacity":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Deployment Capacity</h2>
            <input type="number" className="w-full rounded border p-2" placeholder="How many deployment locations are you planning?" defaultValue={String(form.capacity || "")} onChange={(e) => setForm((prev) => ({ ...prev, capacity: Number(e.target.value) }))} />
          </div>
        );
      case "pricing":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Pricing Summary</h2>
            {pricing ? (
              <div className="rounded border p-4">
                <div className="font-semibold">{pricing.pricing_template_name}</div>
                <div className="text-sm text-slate-500">{pricing.currency}</div>
                <div className="mt-2">Total: {pricing.total.toLocaleString()}</div>
                <div className="mt-2">Included Administrative Users: {pricing.included_admin_users}</div>
              </div>
            ) : null}
          </div>
        );
      case "success":
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Welcome to DeployIQ</h2>
            <p>Your organisation and DeployIQ Retail workspace are ready.</p>
          </div>
        );
      default:
        return null;
    }
  };

  const canGoNext = currentStep !== "product" || Boolean(form.selectedProduct);

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-4xl rounded border bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">DeployIQ Onboarding</p>
            <h1 className="text-2xl font-semibold">Self-Service Onboarding</h1>
          </div>
          <div className="text-sm text-slate-500">Step {stepIndex + 1} of {steps.length}</div>
        </div>
        {errors.length > 0 ? <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errors.join(" ")}</div> : null}
        {renderStep()}
        <div className="mt-6 flex justify-between">
          <button className="rounded border px-4 py-2" onClick={() => setStepIndex((value) => Math.max(0, value - 1))} disabled={stepIndex === 0}>Back</button>
          <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={next} disabled={isLoading || !canGoNext}>{isLoading ? "Working..." : "Continue"}</button>
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-4xl rounded border bg-white p-8 shadow-sm">Loading onboarding...</div></main>}>
      <OnboardingContent />
    </Suspense>
  );
}
