import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — DeployIQ",
  description: "DeployIQ Privacy Policy (working draft).",
};

const EFFECTIVE_DATE = "Effective date: to be confirmed";
const LAST_UPDATED   = "Last updated: August 2026";
const CONTACT_EMAIL  = "legal@deployiq.ng";

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">{EFFECTIVE_DATE} · {LAST_UPDATED}</p>

          <Section id="information-collected" title="1. Information collected">
            <p>
              DeployIQ collects information you provide when creating a workspace, submitting
              field evidence, and using the Service, as well as information generated automatically
              through your use of the Service.
            </p>
          </Section>

          <Section id="account-data" title="2. Account and organisation data">
            <p>
              When you register, we collect your name, business email address, mobile number,
              organisation name, workspace configuration, and related account details. This
              information is necessary to create and operate your workspace.
            </p>
          </Section>

          <Section id="field-evidence" title="3. Field evidence, photos and GPS information">
            <p>
              Field teams using the Service may submit photographs, GPS coordinates, timestamps,
              and other deployment evidence. This data is stored in your workspace and is
              accessible to your administrators and any stakeholders you grant access.
            </p>
            <p>
              We process this data solely to provide the Service to you. We do not use field
              evidence for any purpose beyond operating and improving the Service.
            </p>
          </Section>

          <Section id="device-usage" title="4. Device and usage information">
            <p>
              We automatically collect information about how you access and use the Service,
              including IP addresses, browser type, device identifiers, pages visited, and
              actions taken. This information is used for security, performance monitoring,
              and improving the Service.
            </p>
          </Section>

          <Section id="how-used" title="5. How information is used">
            <p>We use the information we collect to:</p>
            <ul>
              <li>create and operate your DeployIQ workspace;</li>
              <li>send verification codes and account-related communications;</li>
              <li>provide customer support;</li>
              <li>detect and prevent fraud, abuse, and security incidents;</li>
              <li>comply with legal obligations.</li>
            </ul>
          </Section>

          <Section id="ai-processing" title="6. AI-assisted processing">
            <p>
              DeployIQ offers optional AI-assisted validation of field evidence. Where you enable
              this feature, submitted photographs and evidence may be processed by AI models
              to assess quality and completeness. This processing occurs within the Service's
              infrastructure and is subject to the same data-handling commitments described in
              this policy.
            </p>
            <p>
              AI-assisted validation does not result in automated legal or significant decisions
              about individuals without human review.
            </p>
          </Section>

          <Section id="sharing" title="7. Data sharing and service providers">
            <p>
              We do not sell your data. We share information only with service providers who
              assist us in operating the Service (such as cloud infrastructure, email delivery,
              and payment processing), under data-processing agreements that restrict their use
              of your data.
            </p>
            <p>
              We may disclose information when required by law, court order, or governmental
              authority, or to protect the rights, property, or safety of DeployIQ, our
              customers, or the public.
            </p>
          </Section>

          <Section id="retention" title="8. Data retention">
            <p>
              We retain your data for as long as your account is active or as needed to provide
              the Service. On termination of your account, you may request deletion of your data.
              We will retain data as required by law or legitimate business purposes.
            </p>
          </Section>

          <Section id="security" title="9. Security">
            <p>
              We implement reasonable technical and organisational measures to protect your data
              against unauthorised access, disclosure, or destruction. No method of transmission
              over the internet is completely secure, and we cannot guarantee absolute security.
            </p>
          </Section>

          <Section id="cookies" title="10. Cookies">
            <p>
              We use cookies and similar technologies to maintain sessions, remember preferences,
              and analyse usage. You can configure your browser to refuse cookies, but some
              features of the Service may not function correctly without them.
            </p>
          </Section>

          <Section id="transfers" title="11. International transfers">
            <p>
              [Placeholder — details of international data transfers and applicable safeguards
              will be confirmed following legal review and infrastructure decisions.]
            </p>
          </Section>

          <Section id="rights" title="12. Customer and data-subject rights">
            <p>
              Depending on your jurisdiction, you may have rights to access, correct, delete, or
              restrict processing of your personal data, or to receive a copy of it in a portable
              format. To exercise these rights, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-600 hover:underline">{CONTACT_EMAIL}</a>.
            </p>
          </Section>

          <Section id="children" title="13. Children">
            <p>
              The Service is not directed at children under the age of 18. We do not knowingly
              collect personal data from children. If we become aware that we have collected
              personal data from a child, we will take steps to delete it.
            </p>
          </Section>

          <Section id="changes" title="14. Changes to the policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by email or by posting a notice in the Service. Continued use after changes
              take effect constitutes your acceptance of the updated policy.
            </p>
          </Section>

          <Section id="contact" title="15. Contact">
            <p>
              If you have questions about this Privacy Policy or our data practices, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-600 hover:underline">{CONTACT_EMAIL}</a>.
            </p>
          </Section>
        </div>

        <div className="mt-12 border-t border-slate-100 pt-6 text-center">
          <Link href="/terms" className="text-sm text-orange-600 hover:underline">
            Terms of Service
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
