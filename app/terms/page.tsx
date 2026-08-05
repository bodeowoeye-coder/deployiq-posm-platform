import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — DeployIQ",
  description: "DeployIQ Terms of Service (working draft).",
};

const EFFECTIVE_DATE = "Effective date: to be confirmed";
const LAST_UPDATED   = "Last updated: August 2026";
const CONTACT_EMAIL  = "legal@deployiq.ng";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight text-slate-900 hover:text-orange-600 transition-colors">
            DeployIQ
          </Link>
          <Link href="/onboarding" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors">
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        {/* Draft notice */}
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Working draft — pending legal review</p>
          <p className="mt-1 text-xs text-amber-700">
            This document is a working draft and has not been reviewed by qualified legal counsel.
            It must not be relied upon as legal advice. The final version will be published after review.
          </p>
        </div>

        <div className="prose prose-slate max-w-none">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Terms of Service</h1>
          <p className="mt-2 text-sm text-slate-500">{EFFECTIVE_DATE} · {LAST_UPDATED}</p>

          <Section id="introduction" title="1. Introduction and acceptance">
            <p>
              These Terms of Service ("Terms") govern your access to and use of the DeployIQ
              platform ("Service"), operated by DeployIQ ("we", "us", or "our"). By registering
              an account, creating a workspace, or using any part of the Service, you agree to
              be bound by these Terms.
            </p>
            <p>
              If you are accepting on behalf of an organisation, you represent that you have
              authority to bind that organisation to these Terms.
            </p>
            <p>
              If you do not agree to these Terms, do not use the Service.
            </p>
          </Section>

          <Section id="eligibility" title="2. Eligibility and account responsibilities">
            <p>
              You must be at least 18 years old and have the legal capacity to enter into contracts
              in your jurisdiction to use the Service.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials
              and for all activity that occurs under your account. You must notify us immediately
              at <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-600 hover:underline">{CONTACT_EMAIL}</a> of
              any unauthorised access or security breach.
            </p>
          </Section>

          <Section id="service-use" title="3. Use of DeployIQ services">
            <p>
              We grant you a limited, non-exclusive, non-transferable licence to access and use
              the Service for your internal business operations, subject to these Terms and your
              subscription plan.
            </p>
            <p>
              You may not resell, sublicence, or provide the Service as a white-label product to
              third parties without express written permission.
            </p>
          </Section>

          <Section id="customer-data" title="4. Customer data and field evidence">
            <p>
              You retain ownership of all data you upload or generate using the Service, including
              field evidence, photographs, GPS coordinates, and deployment records ("Customer Data").
            </p>
            <p>
              You grant us a limited licence to store, process, and display Customer Data solely
              for the purpose of providing the Service. We will not use Customer Data for any
              purpose beyond operating the Service.
            </p>
            <p>
              You are responsible for ensuring that you have the necessary rights and permissions
              to upload Customer Data, including data relating to individuals.
            </p>
          </Section>

          <Section id="acceptable-use" title="5. Acceptable use">
            <p>You must not use the Service to:</p>
            <ul>
              <li>violate any applicable law or regulation;</li>
              <li>upload false, misleading, or fraudulent field evidence;</li>
              <li>interfere with or disrupt the integrity or performance of the Service;</li>
              <li>attempt to gain unauthorised access to any component of the Service;</li>
              <li>transmit malware, viruses, or other harmful code.</li>
            </ul>
          </Section>

          <Section id="fees" title="6. Fees, subscriptions and payment">
            <p>
              Fees are set out in your commercial plan and are billed as agreed at the time of
              workspace provisioning. All fees are non-refundable except as required by law or
              as expressly stated in your agreement.
            </p>
            <p>
              We reserve the right to suspend access to the Service if fees remain unpaid after
              the due date, following reasonable notice.
            </p>
          </Section>

          <Section id="ip" title="7. Intellectual property">
            <p>
              DeployIQ and its licensors own all intellectual property rights in the Service,
              including software, interfaces, and documentation. Nothing in these Terms transfers
              any such rights to you.
            </p>
          </Section>

          <Section id="confidentiality" title="8. Confidentiality">
            <p>
              Each party agrees to keep confidential the other party's non-public information
              and not to disclose it to third parties without prior written consent, except as
              required by law.
            </p>
          </Section>

          <Section id="availability" title="9. Service availability">
            <p>
              We aim to provide a reliable Service but cannot guarantee uninterrupted availability.
              Planned maintenance will be communicated in advance where practicable. We are not
              liable for any loss arising from temporary unavailability.
            </p>
          </Section>

          <Section id="termination" title="10. Suspension and termination">
            <p>
              Either party may terminate these Terms upon written notice. We may suspend or
              terminate your access immediately for material breach of these Terms or for
              non-payment of fees.
            </p>
            <p>
              On termination, your access to the Service will cease and you may request an export
              of your Customer Data within 30 days of termination.
            </p>
          </Section>

          <Section id="disclaimers" title="11. Disclaimers">
            <p>
              The Service is provided "as is" without warranty of any kind, express or implied.
              We do not warrant that the Service will be error-free, uninterrupted, or suitable
              for your particular purpose.
            </p>
          </Section>

          <Section id="liability" title="12. Limitation of liability">
            <p>
              To the maximum extent permitted by applicable law, our total liability arising out
              of or in connection with these Terms shall not exceed the fees paid by you in the
              three months preceding the claim. We are not liable for indirect, consequential,
              special, or punitive damages.
            </p>
          </Section>

          <Section id="governing-law" title="13. Governing law">
            <p>
              [Placeholder — to be confirmed following legal review. The governing law and
              jurisdiction will be stated in the final version of this document.]
            </p>
          </Section>

          <Section id="contact" title="14. Contact">
            <p>
              If you have questions about these Terms, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-600 hover:underline">{CONTACT_EMAIL}</a>.
            </p>
          </Section>
        </div>

        <div className="mt-12 border-t border-slate-100 pt-6 text-center">
          <Link href="/privacy" className="text-sm text-orange-600 hover:underline">
            Privacy Policy
          </Link>
          <span className="mx-3 text-slate-300">·</span>
          <Link href="/onboarding" className="text-sm text-slate-500 hover:text-slate-700">
            Back to setup
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}
