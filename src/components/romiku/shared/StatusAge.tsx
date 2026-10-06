import { useEffect, useState } from "react";

export function statusDuration(
  changedAt: string | null | undefined,
  now = Date.now(),
) {
  if (!changedAt) return "—";
  const timestamp = Date.parse(changedAt);
  if (!Number.isFinite(timestamp)) return "—";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes === 0) return "刚刚";
  if (minutes < 60) return `${minutes}分钟`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时`;
  return `${Math.floor(minutes / 1440)}天`;
}
export function statusTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
export function StatusAge({ changedAt }: { changedAt?: string | null }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span
      aria-label="当前状态持续时间"
      className="block text-xs text-muted-foreground"
      title={
        changedAt
          ? `当前状态开始：${statusTimestamp(changedAt)}（上海时间）`
          : "尚无状态时间"
      }
    >
      {statusDuration(changedAt, Math.max(now, Date.now()))}
    </span>
  );
}
