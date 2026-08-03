"use client";

type Props = {
  steps: string[];
  currentIndex: number;
};

export function OnboardingProgress({ steps, currentIndex }: Props) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-2xl px-4 py-3">
        <nav
          className="flex items-center gap-1"
          aria-label="Onboarding progress"
          role="list"
        >
          {steps.map((label, i) => {
            const isDone = i < currentIndex;
            const isCurrent = i === currentIndex;
            return (
              <div key={i} className="flex items-center gap-1" role="listitem">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                    aria-hidden="true"
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  <span
                    className={`hidden text-xs font-medium sm:block ${
                      isCurrent
                        ? "text-slate-900"
                        : isDone
                        ? "text-emerald-600"
                        : "text-slate-400"
                    }`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {label}
                  </span>
                </div>
                {i < steps.length - 1 ? (
                  <span
                    className={`h-px w-6 sm:w-10 ${
                      isDone ? "bg-emerald-300" : "bg-slate-200"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
