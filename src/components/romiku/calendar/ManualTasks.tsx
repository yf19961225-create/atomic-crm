import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
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
        <h1 className="text-3xl font-semibold">Manual tasks</h1>
        <Button asChild>
          <Link to="/calendar/tasks/new">New manual task</Link>
        </Button>
      </div>
      <Link className="underline" to="/calendar">
        Back to Calendar
      </Link>
      <OwnerFilter state={owner} />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={completed}
          onChange={(e) => setCompleted(e.target.checked)}
        />
        Include completed
      </label>
      {query.isPending && <p>Loading tasks…</p>}
      {query.error && (
        <p role="alert">
          Could not load tasks.{" "}
          <button onClick={() => query.refetch()}>Retry</button>
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
                ? new Date(task.due_at).toLocaleString()
                : "Unscheduled"}{" "}
              · {task.priority} · {task.completed_at ? "Completed" : "Pending"}
            </span>
          </li>
        ))}
      </ul>
      {query.data && !tasks.length && <p>No tasks in this selection.</p>}
    </section>
  );
}
export function ManualTaskPage() {
  const { id } = useParams();
  const owners = useOwners();
  const query = useGetOne(
    "romiku_manual_tasks",
    { id: id || "new" },
    { enabled: !!id && id !== "new" },
  );
  if (owners.isPending || (id !== "new" && query.isPending))
    return <p>Loading task…</p>;
  if (owners.error || (id !== "new" && query.error))
    return (
      <p role="alert">
        Could not load task.{" "}
        <Button
          onClick={() => {
            owners.refetch();
            if (id !== "new") query.refetch();
          }}
        >
          Retry
        </Button>
      </p>
    );
  return (
    <TaskEditor
      key={id}
      record={id === "new" ? undefined : query.data}
      defaultOwner={owners.mine}
      owners={owners.owners}
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
}: {
  record?: RaRecord;
  defaultOwner?: string;
  owners: RaRecord[];
}) {
  const provider = useDataProvider();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, unknown>>(
    record
      ? { ...record, due_at: localInput(record.due_at) }
      : { title: "", priority: "normal", owner_id: defaultOwner || "" },
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
      else setMessage("Task saved.");
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
        {record ? "Edit manual task" : "New manual task"}
      </h1>
      <div className="flex gap-4">
        <Link className="underline" to="/calendar/tasks">
          Manual tasks
        </Link>
        <Link className="underline" to="/calendar">
          Calendar
        </Link>
        {savedRelation && (
          <Link
            className="underline"
            to={sourceHref(
              taskSources[savedRelation].resource,
              String(record![savedRelation]),
            )}
          >
            Open related source
          </Link>
        )}
      </div>
      <p className="text-muted-foreground">
        A task can stand alone or link to one source. Add a due date to show it
        in Calendar.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          Task title
          <input
            className={inputClass}
            required
            value={String(values.title || "")}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label className="block">
          Due date
          <input
            className={inputClass}
            type="datetime-local"
            value={String(values.due_at || "")}
            onChange={(e) => set("due_at", e.target.value)}
          />
        </label>
        <label className="block">
          Priority
          <select
            aria-label="Priority"
            className={inputClass}
            value={String(values.priority)}
            onChange={(e) => set("priority", e.target.value)}
          >
            {["low", "normal", "high", "urgent"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Task owner
          <select
            aria-label="Task owner"
            className={inputClass}
            value={String(values.owner_id || "")}
            onChange={(e) => set("owner_id", e.target.value)}
          >
            <option value="">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.user_id}>
                {o.first_name} {o.last_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Related source
          <select
            aria-label="Related source"
            className={inputClass}
            value={relation}
            onChange={(e) => {
              setRelation(e.target.value);
              setSourceId("");
            }}
          >
            <option value="">No source</option>
            {Object.entries(taskSources).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </label>
        {resource && (
          <label className="block">
            Source record
            <select
              aria-label="Source record"
              className={inputClass}
              required
              value={sourceId}
              disabled={choices.isPending || !!choices.error}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">Choose source</option>
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
            Could not load source records.{" "}
            <button type="button" onClick={() => choices.refetch()}>
              Retry
            </button>
          </p>
        )}
        <label className="block">
          Notes
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
          Completed
        </label>
        <Button
          type="submit"
          disabled={
            busy || (!!resource && (choices.isPending || !!choices.error))
          }
        >
          {busy ? "Saving…" : "Save task"}
        </Button>
        {message && <p role={failed ? "alert" : "status"}>{message}</p>}
      </form>
    </section>
  );
}
