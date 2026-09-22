import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useDataProvider, useGetOne, type RaRecord } from "ra-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import {
  sourceHref,
  taskSources,
  taskWrite,
  type TaskSource,
} from "./aggregation";
import { OwnerFilter, useOwnerFilter, useOwners } from "./OwnerFilter";
import { priorityLabel } from "../relationshipLabels";

export function ManualTaskList() {
  const provider = useDataProvider();
  const owner = useOwnerFilter();
  const [completed, setCompleted] = useState(false);
  const query = useQuery({
    queryKey: ["romiku-manual-tasks"],
    queryFn: () => readRelated(provider, "romiku_manual_tasks", {}),
    refetchOnMount: "always",
  });
  const tasks = (query.data || []).filter(
    (t) =>
      (!owner.effectiveOwner || t.owner_id === owner.effectiveOwner) &&
      (completed || !t.completed_at),
  );
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">手动任务</h1>
        <Button asChild>
          <Link to="/calendar/tasks/new">新建手动任务</Link>
        </Button>
      </div>
      <Link className="underline" to="/calendar">
        返回日历
      </Link>
      <OwnerFilter state={owner} />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={completed}
          onChange={(e) => setCompleted(e.target.checked)}
        />
        包含已完成任务
      </label>
      {query.isPending && <p>正在加载任务…</p>}
      {query.error && (
        <p role="alert">
          无法加载任务。 <button onClick={() => query.refetch()}>重试</button>
        </p>
      )}
      <ul className="divide-y rounded border">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap justify-between gap-2 p-3"
          >
            <Link
              className="underline"
              to={`/calendar/tasks/${encodeURIComponent(task.id)}`}
            >
              {task.title}
            </Link>
            <span>
              {task.due_at
                ? new Date(task.due_at).toLocaleString("zh-CN")
                : "未安排"}{" "}
              · {priorityLabel(task.priority)} ·{" "}
              {task.completed_at ? "已完成" : "待处理"}
            </span>
          </li>
        ))}
      </ul>
      {query.data && !tasks.length && <p>当前选择中没有任务。</p>}
    </section>
  );
}
export function ManualTaskPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const owners = useOwners();
  const query = useGetOne(
    "romiku_manual_tasks",
    { id: id || "new" },
    { enabled: !!id && id !== "new" },
  );
  if (owners.isPending || (id !== "new" && query.isPending))
    return <p>正在加载任务…</p>;
  if (owners.error || (id !== "new" && query.error))
    return (
      <p role="alert">
        无法加载任务。{" "}
        <Button
          onClick={() => {
            owners.refetch();
            if (id !== "new") query.refetch();
          }}
        >
          重试
        </Button>
      </p>
    );
  return (
    <TaskEditor
      key={id}
      record={id === "new" ? undefined : query.data}
      defaultOwner={owners.mine}
      owners={owners.owners}
      defaultDue={
        id === "new" ? searchParams.get("due") || undefined : undefined
      }
    />
  );
}
function localInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function TaskEditor({
  record,
  defaultOwner,
  owners,
  defaultDue,
}: {
  record?: RaRecord;
  defaultOwner?: string;
  owners: RaRecord[];
  defaultDue?: string;
}) {
  const provider = useDataProvider();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, unknown>>(
    record
      ? { ...record, due_at: localInput(record.due_at) }
      : {
          title: "",
          priority: "normal",
          owner_id: defaultOwner || "",
          due_at: defaultDue || "",
        },
  );
  const [relation, setRelation] = useState(
    Object.keys(taskSources).find((key) => record?.[key]) || "",
  );
  const [sourceId, setSourceId] = useState(String(record?.[relation] || ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const resource = taskSources[relation as TaskSource]?.resource;
  const choices = useQuery({
    queryKey: ["manual-task-sources", resource],
    queryFn: () => readRelated(provider, resource!, {}),
    enabled: !!resource,
  });
  const set = (key: string, value: unknown) =>
    setValues((v) => ({ ...v, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const data = taskWrite(values, relation, sourceId);
      const result = record
        ? await provider.update("romiku_manual_tasks", {
            id: record.id,
            data,
            previousData: record,
          })
        : await provider.create("romiku_manual_tasks", { data });
      await cache.invalidateQueries({
        predicate: (q) =>
          [
            "romiku-calendar",
            "romiku-action-center",
            "romiku-manual-tasks",
            "romiku_manual_tasks",
          ].includes(String(q.queryKey[0])),
      });
      if (!record)
        navigate(`/calendar/tasks/${encodeURIComponent(result.data.id)}`);
      else setMessage("任务已保存。");
    } catch (cause) {
      setFailed(true);
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const inputClass = "block w-full rounded border p-2";
  const savedRelation = Object.keys(taskSources).find(
    (key) => record?.[key],
  ) as TaskSource | undefined;
  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-3xl font-semibold">
        {record ? "编辑手动任务" : "新建手动任务"}
      </h1>
      <div className="flex gap-4">
        <Link className="underline" to="/calendar/tasks">
          手动任务
        </Link>
        <Link className="underline" to="/calendar">
          日历
        </Link>
        {savedRelation && (
          <Link
            className="underline"
            to={sourceHref(
              taskSources[savedRelation].resource,
              String(record![savedRelation]),
            )}
          >
            打开关联来源
          </Link>
        )}
      </div>
      <p className="text-muted-foreground">
        任务可以独立存在，也可以关联一个来源。设置截止日期后会显示在日历中。
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          任务标题
          <input
            className={inputClass}
            required
            value={String(values.title || "")}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label className="block">
          截止日期
          <input
            className={inputClass}
            type="datetime-local"
            value={String(values.due_at || "")}
            onChange={(e) => set("due_at", e.target.value)}
          />
        </label>
        <label className="block">
          优先级
          <select
            aria-label="优先级"
            className={inputClass}
            value={String(values.priority)}
            onChange={(e) => set("priority", e.target.value)}
          >
            {["low", "normal", "high", "urgent"].map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          任务负责人
          <select
            aria-label="任务负责人"
            className={inputClass}
            value={String(values.owner_id || "")}
            onChange={(e) => set("owner_id", e.target.value)}
          >
            <option value="">未分配</option>
            {owners.map((o) => (
              <option key={o.id} value={o.user_id}>
                {o.first_name} {o.last_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          关联来源
          <select
            aria-label="关联来源"
            className={inputClass}
            value={relation}
            onChange={(e) => {
              setRelation(e.target.value);
              setSourceId("");
            }}
          >
            <option value="">不关联来源</option>
            {Object.entries(taskSources).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </label>
        {resource && (
          <label className="block">
            来源记录
            <select
              aria-label="来源记录"
              className={inputClass}
              required
              value={sourceId}
              disabled={choices.isPending || !!choices.error}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">请选择来源</option>
              {choices.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.document_number || r.name || r.id}
                </option>
              ))}
            </select>
          </label>
        )}
        {choices.error && (
          <p role="alert">
            无法加载来源记录。{" "}
            <button type="button" onClick={() => choices.refetch()}>
              重试
            </button>
          </p>
        )}
        <label className="block">
          备注
          <textarea
            className={inputClass}
            value={String(values.notes || "")}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!values.completed_at}
            onChange={(e) =>
              set(
                "completed_at",
                e.target.checked ? new Date().toISOString() : null,
              )
            }
          />
          已完成
        </label>
        <Button
          type="submit"
          disabled={
            busy || (!!resource && (choices.isPending || !!choices.error))
          }
        >
          {busy ? "正在保存…" : "保存任务"}
        </Button>
        {message && <p role={failed ? "alert" : "status"}>{message}</p>}
      </form>
    </section>
  );
}
