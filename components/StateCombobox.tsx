"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { NIGERIA_STATES } from "@/lib/geography";
import { createPortal } from "react-dom";

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

  // Render dropdown to body to avoid clipping from overflow:hidden ancestors
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function refreshRect() {
      const el = inputRef.current;
      if (el) setRect(el.getBoundingClientRect());
    }
    refreshRect();
    window.addEventListener("resize", refreshRect);
    window.addEventListener("scroll", refreshRect, true);
    return () => {
      window.removeEventListener("resize", refreshRect);
      window.removeEventListener("scroll", refreshRect, true);
    };
  }, []);

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
        ref={inputRef}
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
      {open && typeof document !== "undefined" && rect
        ? createPortal(
            <div
              style={{
                position: "absolute",
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
                zIndex: 9999
              }}
            >
              <div className="max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
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
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
