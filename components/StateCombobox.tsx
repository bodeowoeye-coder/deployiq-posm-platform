"use client";

import { useEffect, useMemo, useState } from "react";
import { NIGERIA_STATES } from "@/lib/geography";

export function StateCombobox({
  value,
  onChange,
  required = true,
  placeholder = "Search state",
  inputClassName = "min-h-11"
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  inputClassName?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const options = useMemo(
    () => NIGERIA_STATES.filter((state) => state.toLowerCase().includes(query.trim().toLowerCase())),
    [query]
  );

  useEffect(() => {
    setQuery(value);
  }, [value]);

  return (
    <div className="relative min-w-0">
      <input
        className={`${inputClassName} w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100`}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        name="deployiq-state-selector"
        required={required}
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {options.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">No state found</div> : null}
          {options.map((state) => (
            <button
              key={state}
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-orange-50"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(state);
                onChange(state);
                setOpen(false);
              }}
            >
              {state}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
