import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { manilaTodayISO } from "../lib/manilaTime.js";

// Uniform date/time pickers (2026-09-26): every native <input type="date|time|month">
// in the app routes through these three components so picking a date or a time
// looks and behaves the same everywhere -- a read-only trigger input (keeps the
// label/for wiring, ids, and the browser's `required` form validation working
// exactly as before) plus a modern popover calendar / time-slot list.
// Values never change format: dates "YYYY-MM-DD", months "YYYY-MM", times "HH:MM"
// (24-hour storage, 12-hour display) -- all existing form logic keeps working.
// Past gating (explicit user request 2026-09-26: "if the date and time is
// already past then I shouldn't be able to choose them ... it should be greyed
// out"): DatePicker's `disallowPast` greys out days before Manila-today
// (manilaTodayISO -- never the UTC/browser date), TimePicker's `minTime`
// greys out slots before it (callers pass "now" only when the field's chosen
// date is actually today). "Today"/highlight logic is Manila-based too.
// The popover renders through a portal at document.body so no ancestor
// transform/overflow/backdrop-filter (e.g. modals) can clip or misplace it.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const DEFAULT_TRIGGER =
  "w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60";

const TRIGGER_EXTRA = " cursor-pointer pr-10 placeholder:text-slate-400";

const POPOVER_SHELL =
  "fixed z-[70] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-black/5";

const GAP = 8;

const pad = (n) => String(n).padStart(2, "0");

const parseDate = (v) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)))
    : null;

const formatDateDisplay = (v) => {
  const d = parseDate(v);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
};

const formatTimeDisplay = (v) => {
  if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return "";
  const hour = Number(v.slice(0, 2));
  const meridiem = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${v.slice(3, 5)} ${meridiem}`;
};

const formatMonthDisplay = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}$/.test(v)) return "";
  return `${MONTH_SHORT[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`;
};

function useDismiss(anchorRef, popRef, open, close) {
  useEffect(() => {
    if (!open) return undefined;
    const isInside = (target) =>
      (anchorRef.current && anchorRef.current.contains(target)) ||
      (popRef.current && popRef.current.contains(target));
    const onPointerDown = (event) => {
      if (!isInside(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    const onFocusIn = (event) => {
      if (!isInside(event.target)) close();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [anchorRef, popRef, open, close]);
}

const computePosition = (rect, width, height) => {
  const viewW = document.documentElement.clientWidth;
  const viewH = document.documentElement.clientHeight;
  let top = rect.bottom + GAP;
  if (top + height > viewH && rect.top - GAP - height > 0) {
    top = rect.top - GAP - height;
  }
  const left = Math.max(GAP, Math.min(rect.left, viewW - width - GAP));
  return { top, left };
};

// Position is measured in event handlers (open / scroll / resize), never in an
// effect body, so the popover mounts already placed instead of flashing at 0,0.
function useAnchoredPosition(open, anchorRef, width, height) {
  const [pos, setPos] = useState(null);
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const next = computePosition(anchor.getBoundingClientRect(), width, height);
    setPos((prev) =>
      prev && prev.top === next.top && prev.left === next.left ? prev : next,
    );
  }, [anchorRef, width, height]);
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);
  return [pos, place];
}

function PickerTrigger({
  inputRef,
  id,
  name,
  required,
  disabled,
  ariaLabel,
  placeholder,
  display,
  className,
  icon: Icon,
  onOpen,
}) {
  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        readOnly
        required={required}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        value={display}
        placeholder={placeholder}
        className={`${className || DEFAULT_TRIGGER}${TRIGGER_EXTRA}`}
        onFocus={onOpen}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
      />
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
}

const IconHeaderButton = ({ label, disabled, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);

export function DatePicker({
  value,
  onChange,
  min,
  max,
  id,
  name,
  required = false,
  disabled = false,
  ariaLabel,
  placeholder = "Select a date",
  className,
  allowClear = false,
  disallowPast = false,
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const anchorRef = useRef(null);
  const popRef = useRef(null);
  const today = manilaTodayISO();
  // disallowPast: never earlier than Manila-today, but an explicit stricter
  // `min` (e.g. today + MIN_SCHEDULING_DAYS) still wins.
  const effectiveMin = disallowPast ? (min && min > today ? min : today) : min;
  const seed = parseDate(value) || parseDate(effectiveMin) || parseDate(today);
  const [view, setView] = useState({ year: seed.getFullYear(), month: seed.getMonth() });

  useDismiss(anchorRef, popRef, open, close);
  const [pos, place] = useAnchoredPosition(open, anchorRef, 304, 360);

  const openPicker = () => {
    if (disabled) return;
    const next = parseDate(value) || parseDate(effectiveMin) || parseDate(today);
    setView({ year: next.getFullYear(), month: next.getMonth() });
    place();
    setOpen(true);
  };

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const leadingBlanks = Array.from({ length: firstWeekday }, () => null);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const trailingBlanks = Array.from(
    { length: (7 - ((firstWeekday + daysInMonth) % 7)) % 7 },
    () => null,
  );
  const cells = [...leadingBlanks, ...days, ...trailingBlanks];

  const monthKeyOf = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  const viewKey = view.year * 12 + view.month;
  const canGoPrev = !effectiveMin || viewKey > monthKeyOf(effectiveMin);
  const canGoNext = !max || viewKey < monthKeyOf(max);
  const todayAllowed =
    (!effectiveMin || today >= effectiveMin) && (!max || today <= max);

  const pickDay = (iso) => {
    onChange(iso);
    close();
  };

  return (
    <>
      <PickerTrigger
        inputRef={anchorRef}
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        display={formatDateDisplay(value)}
        className={className}
        icon={Calendar}
        onOpen={openPicker}
      />
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel || "Choose a date"}
            style={{ top: pos.top, left: pos.left, width: 304 }}
            className={POPOVER_SHELL}
          >
            <div className="mb-1 flex items-center justify-between">
              <IconHeaderButton
                label="Previous month"
                disabled={!canGoPrev}
                onClick={() =>
                  setView(({ year, month }) =>
                    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
                  )
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </IconHeaderButton>
              <span className="text-sm font-semibold text-slate-800">
                {MONTH_NAMES[view.month]} {view.year}
              </span>
              <IconHeaderButton
                label="Next month"
                disabled={!canGoNext}
                onClick={() =>
                  setView(({ year, month }) =>
                    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
                  )
                }
              >
                <ChevronRight className="h-4 w-4" />
              </IconHeaderButton>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 px-0.5">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="flex h-6 items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, index) => {
                if (day === null) return <div key={`blank-${index}`} />;
                const iso = `${view.year}-${pad(view.month + 1)}-${pad(day)}`;
                const outOfRange =
                  (effectiveMin && iso < effectiveMin) || (max && iso > max);
                const isSelected = iso === value;
                const isToday = iso === today;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={outOfRange}
                    aria-pressed={isSelected}
                    aria-label={`${MONTH_NAMES[view.month]} ${day}, ${view.year}`}
                    onClick={() => pickDay(iso)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm transition ${
                      isSelected
                        ? "bg-emerald-600 font-semibold text-white shadow-sm shadow-emerald-600/30"
                        : outOfRange
                          ? "cursor-not-allowed text-slate-300"
                          : isToday
                            ? "font-semibold text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-50"
                            : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <button
                type="button"
                disabled={!todayAllowed}
                onClick={() => pickDay(today)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                Today
              </button>
              {allowClear && (
                <button
                  type="button"
                  disabled={!value}
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function TimePicker({
  value,
  onChange,
  step = 15,
  id,
  name,
  required = false,
  disabled = false,
  ariaLabel,
  placeholder = "Select a time",
  className,
  minTime,
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const anchorRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);

  const slots = useMemo(() => {
    const out = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += step) {
      out.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
    }
    return out;
  }, [step]);

  useDismiss(anchorRef, popRef, open, close);
  const [pos, place] = useAnchoredPosition(open, anchorRef, 192, 320);

  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const target =
      listRef.current.querySelector("[data-selected]") ||
      listRef.current.querySelector('[data-slot="08:00"]') ||
      listRef.current.firstElementChild;
    if (target) {
      listRef.current.scrollTop =
        target.offsetTop - listRef.current.clientHeight / 2 + target.offsetHeight / 2;
    }
  }, [open, value, slots]);

  return (
    <>
      <PickerTrigger
        inputRef={anchorRef}
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        display={formatTimeDisplay(value)}
        className={className}
        icon={Clock}
        onOpen={() => {
          if (disabled) return;
          place();
          setOpen(true);
        }}
      />
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel || "Choose a time"}
            style={{ top: pos.top, left: pos.left, width: 192 }}
            className={POPOVER_SHELL}
          >
            <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Clock className="h-3 w-3" />
              Select time
            </p>
            <div
              ref={listRef}
              className="relative max-h-64 overflow-y-auto overscroll-contain pr-1"
            >
              <div className="grid grid-cols-2 gap-1">
                {slots.map((slot) => {
                  const isSelected = slot === value;
                  // minTime (HH:MM): slots strictly before it are already past
                  // and get greyed out/unselectable (same zero-padded 24-hour
                  // format as value, so plain string compare is correct).
                  const isBlocked = Boolean(minTime) && slot < minTime;
                  return (
                    <button
                      key={slot}
                      type="button"
                      data-slot={slot}
                      data-selected={isSelected || undefined}
                      aria-pressed={isSelected}
                      disabled={isBlocked}
                      onClick={() => {
                        onChange(slot);
                        close();
                      }}
                      className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                          : isBlocked
                            ? "cursor-not-allowed text-slate-300"
                            : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {formatTimeDisplay(slot)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function MonthPicker({
  value,
  onChange,
  min,
  max,
  id,
  name,
  required = false,
  disabled = false,
  ariaLabel,
  placeholder = "Select a month",
  className,
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const anchorRef = useRef(null);
  const popRef = useRef(null);
  const seedYear = value ? Number(value.slice(0, 4)) : new Date().getFullYear();
  const [year, setYear] = useState(seedYear);

  useDismiss(anchorRef, popRef, open, close);
  const [pos, place] = useAnchoredPosition(open, anchorRef, 256, 260);

  const minMonth = typeof min === "string" ? min.slice(0, 7) : null;
  const maxMonth = typeof max === "string" ? max.slice(0, 7) : null;
  const canGoPrev = !minMonth || `${year}-01` > minMonth;
  const canGoNext = !maxMonth || `${year}-12` < maxMonth;

  return (
    <>
      <PickerTrigger
        inputRef={anchorRef}
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        display={formatMonthDisplay(value)}
        className={className}
        icon={Calendar}
        onOpen={() => {
          if (disabled) return;
          setYear(value ? Number(value.slice(0, 4)) : new Date().getFullYear());
          place();
          setOpen(true);
        }}
      />
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel || "Choose a month"}
            style={{ top: pos.top, left: pos.left, width: 256 }}
            className={POPOVER_SHELL}
          >
            <div className="mb-2 flex items-center justify-between">
              <IconHeaderButton
                label="Previous year"
                disabled={!canGoPrev}
                onClick={() => setYear((y) => y - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </IconHeaderButton>
              <span className="text-sm font-semibold text-slate-800">{year}</span>
              <IconHeaderButton
                label="Next year"
                disabled={!canGoNext}
                onClick={() => setYear((y) => y + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </IconHeaderButton>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {MONTH_SHORT.map((monthName, index) => {
                const iso = `${year}-${pad(index + 1)}`;
                const outOfRange =
                  (minMonth && iso < minMonth) || (maxMonth && iso > maxMonth);
                const isSelected = iso === value;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={outOfRange}
                    aria-pressed={isSelected}
                    onClick={() => {
                      onChange(iso);
                      close();
                    }}
                    className={`rounded-lg py-2 text-xs font-medium transition ${
                      isSelected
                        ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                        : outOfRange
                          ? "cursor-not-allowed text-slate-300"
                          : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {monthName}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
