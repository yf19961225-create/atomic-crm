import { useState, type Ref } from "react";
import { CalendarDays } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  calendarDates,
  localBusinessDateTime,
  resolveBusinessDateTime,
  validBusinessDate,
} from "./businessDate";
export type RomikuDatePickerProps = {
  inputRef?: Ref<HTMLInputElement>;
  value: unknown;
  onChange: (value: string | null) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  name?: string;
  id?: string;
  onBlur?: () => void;
  className?: string;
};
export function RomikuDatePicker(props: RomikuDatePickerProps) {
  return <CalendarInput {...props} datetime={false} />;
}
export function RomikuDateTimePicker(props: RomikuDatePickerProps) {
  return <CalendarInput {...props} datetime />;
}
function CalendarInput({
  inputRef,
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  readOnly = false,
  name,
  id,
  onBlur,
  className,
  datetime,
}: RomikuDatePickerProps & { datetime: boolean }) {
  const raw = String(value ?? "");
  const local = datetime ? localBusinessDateTime(raw) : raw;
  const date = local.slice(0, 10);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    validBusinessDate(date)
      ? date.slice(0, 7)
      : localBusinessDateTime(new Date().toISOString()).slice(0, 7),
  );
  const [error, setError] = useState("");
  const [ambiguous, setAmbiguous] = useState<string[]>([]);
  const year = Number(month.slice(0, 4)),
    mo = Number(month.slice(5, 7));
  const years = [
    ...new Set([
      ...Array.from(
        { length: 201 },
        (_, i) => new Date().getFullYear() - 100 + i,
      ),
      year,
    ]),
  ]
    .filter((y) => y >= 1 && y <= 9999)
    .sort((a, b) => a - b);
  const show = (next: boolean) => {
    if (next) {
      setMonth(
        validBusinessDate(date)
          ? date.slice(0, 7)
          : localBusinessDateTime(new Date().toISOString()).slice(0, 7),
      );
      setError("");
      setAmbiguous([]);
    }
    setOpen(next);
  };
  const commit = (day: string, time = local.slice(11) || "00:00") => {
    setError("");
    setAmbiguous([]);
    if (!day) {
      onChange(null);
      return;
    }
    if (!datetime) {
      if (validBusinessDate(day)) {
        onChange(day);
        setOpen(false);
      } else setError("请选择有效日期。");
      return;
    }
    const options = resolveBusinessDateTime(day, time, raw);
    if (options.length === 1) {
      onChange(options[0]);
      setOpen(false);
    } else if (options.length > 1) {
      setOpen(true);
      setAmbiguous(options);
      setError("该时间因夏令时重复，请选择明确的时区偏移。");
    } else {
      setOpen(true);
      setError("该本地日期或时间无效，可能处于夏令时跳时，请重新选择。");
    }
  };
  const shift = (delta: number) => {
    const next = new Date(0);
    next.setUTCFullYear(year, mo - 1 + delta, 1);
    const y = next.getUTCFullYear();
    if (y >= 1 && y <= 9999)
      setMonth(
        `${String(y).padStart(4, "0")}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`,
      );
  };
  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverAnchor asChild>
        <span className="flex w-full min-w-0 items-center gap-1">
          <input
            ref={inputRef}
            id={id}
            name={name}
            aria-label={label}
            type={datetime ? "datetime-local" : "date"}
            step={datetime ? "0.001" : undefined}
            className={
              className ??
              "h-9 min-w-0 w-full rounded border bg-background px-2 text-sm"
            }
            value={local}
            required={required}
            disabled={disabled}
            readOnly={readOnly}
            onBlur={onBlur}
            onClick={(e) => {
              if (!disabled && !readOnly) {
                e.preventDefault();
                show(true);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && !disabled && !readOnly) {
                e.preventDefault();
                show(true);
              }
            }}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) {
                onChange(null);
                return;
              }
              if (datetime) commit(next.slice(0, 10), next.slice(11));
              else commit(next);
            }}
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={disabled || readOnly}
              aria-label={`打开${label}日历`}
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </span>
      </PopoverAnchor>
      <PopoverContent
        className="w-[320px] max-w-[calc(100vw-24px)] p-3"
        style={{ width: 320, maxWidth: "calc(100vw - 24px)" }}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="mb-2 flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="上个月"
            onClick={() => shift(-1)}
          >
            ‹
          </Button>
          <select
            aria-label="日历年份"
            className="min-w-0 rounded border p-1"
            value={year}
            onChange={(e) =>
              setMonth(
                `${e.target.value.padStart(4, "0")}-${String(mo).padStart(2, "0")}`,
              )
            }
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
          <select
            aria-label="日历月份"
            className="min-w-0 rounded border p-1"
            value={mo}
            onChange={(e) =>
              setMonth(
                `${String(year).padStart(4, "0")}-${e.target.value.padStart(2, "0")}`,
              )
            }
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}月
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="下个月"
            onClick={() => shift(1)}
          >
            ›
          </Button>
        </div>
        <div
          className="grid grid-cols-7 text-center text-sm"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7,minmax(0,1fr))",
          }}
        >
          {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
            <span key={w} className="py-1 text-muted-foreground">
              {w}
            </span>
          ))}
          {calendarDates(year, mo).map((day) => (
            <button
              type="button"
              key={day}
              aria-label={day}
              aria-pressed={date === day}
              className={`h-9 rounded hover:bg-muted ${date === day ? "bg-primary text-primary-foreground" : day.slice(0, 7) !== month ? "text-muted-foreground" : ""}`}
              onClick={() => commit(day)}
            >
              {Number(day.slice(8))}
            </button>
          ))}
        </div>
        {datetime && (
          <label className="mt-2 block text-sm">
            时间{" "}
            <input
              type="time"
              aria-label={`${label}时间`}
              step="0.001"
              className="rounded border p-1"
              value={local.slice(11) || "00:00"}
              onChange={(e) => commit(date, e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              时区：{Intl.DateTimeFormat().resolvedOptions().timeZone}
            </span>
          </label>
        )}
        <div className="mt-2 flex justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              commit(
                localBusinessDateTime(new Date().toISOString()).slice(0, 10),
              )
            }
          >
            今天
          </Button>
          {!required && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              清空日期
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm">
            {error}
          </p>
        )}
        {ambiguous.map((option) => (
          <Button
            className="mt-1 w-full"
            type="button"
            variant="outline"
            key={option}
            onClick={() => {
              onChange(option);
              setAmbiguous([]);
              setError("");
              setOpen(false);
            }}
          >
            {new Date(option).toLocaleTimeString("zh-CN", {
              timeZoneName: "shortOffset",
              hour12: false,
            })}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
