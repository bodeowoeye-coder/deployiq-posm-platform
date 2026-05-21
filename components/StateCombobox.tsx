"use client";

import { useEffect, useMemo, useState } from "react";
import { NIGERIA_STATES } from "@/lib/geography";

export function StateCombobox({
  value,
  onChange,
  required = true,
  placeholder = "Search state",
  inputClassName = "min-h-11",
  autoComplete = "new-password",
  inputName = "deployiq-state-selector",
  inputId
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  inputClassName?: string;
  autoComplete?: string;
  inputName?: string;
  inputId?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const options = useMemo(
    () => NIGERIA_STATES.filter((state) => state.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery]
  );

  useEffect(() => {
    setQuery(value);
  }, [value]);

  function handleInputChange(nextValue: string) {
    setQuery(nextValue);
    setOpen(true);

    if (NIGERIA_STATES.includes(nextValue as (typeof NIGERIA_STATES)[number])) {
      onChange(nextValue);
    } else if (nextValue === "") {
      onChange("");
    } else {
      onChange("");
    }
  }

  function selectState(state: string) {
    setQuery(state);
    setOpen(false);
    onChange(state);
  }

  return (
    <div className="relative min-w-0">
      <input
        className={`${inputClassName} w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100`}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => handleInputChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        name={inputName}
        id={inputId}
        aria-autocomplete="list"
        required={required}
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {options.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">No state found</div> : null}
          {options.map((state) => {
            const isSelected = state === query.trim();
            return (
              <button
                key={state}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm transition ${isSelected ? "bg-orange-50 font-semibold text-slate-900" : "hover:bg-orange-50"}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectState(state)}
                aria-selected={isSelected}
              >
                {state}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
