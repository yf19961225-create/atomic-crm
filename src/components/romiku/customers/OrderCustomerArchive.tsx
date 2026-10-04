import { useState } from "react";
import { Link } from "react-router";
import { useGetOne, type RaRecord } from "ra-core";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormalCustomerSelector } from "../commercial/FormalCustomerSelector";
import { customerRpc, type ArchivePlan } from "./customerBusinessApi";
export function OrderCustomerArchive({ record }: { record: RaRecord }) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<"existing" | "new">("existing"),
    [customerId, setCustomerId] = useState<string | null>(
      record.formal_customer_id || null,
    ),
    [name, setName] = useState(""),
    [includeHistory, setIncludeHistory] = useState(true),
    [plan, setPlan] = useState<ArchivePlan | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [success, setSuccess] = useState<string | null>(null);
  const selectedCustomer = useGetOne(
    "romiku_formal_customers",
    { id: customerId || "" },
    { enabled: open && mode === "existing" && !!customerId },
  );
  async function preview() {
    setBusy(true);
    setFailure("");
    try {
      setPlan(
        await customerRpc<ArchivePlan>("romiku_customer_archive_plan", {
          order_id: record.id,
        }),
      );
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!plan) return;
    setBusy(true);
    setFailure("");
    try {
      const result = await customerRpc<{ ok: boolean; customer_id: string }>(
        "romiku_confirm_customer_archive",
        {
          order_id: record.id,
          customer_id: mode === "existing" ? customerId : null,
          include_history: includeHistory,
          expected_token: plan.token,
          new_customer_name: mode === "new" ? name.trim() : null,
        },
      );
      setPlan(null);
      setCustomerId(result.customer_id);
      setMode("existing");
      setSuccess(result.customer_id);
      await cache.invalidateQueries();
    } catch (e) {
      setFailure((e as Error).message);
      setPlan(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <Button variant="outline" onClick={() => setOpen(!open)}>
        客户归档
      </Button>
      {open && (
        <div className="rounded border p-4 space-y-3">
          <p>
            仅在客户已成交后，明确建立或关联 Formal
            Customer。历史单据只补客户关联，不修改快照、产品或价格。
          </p>
          <fieldset disabled={busy || !!plan} className="space-y-3">
            <label>
              客户选择{" "}
              <select
                aria-label="归档客户方式"
                className="rounded border p-2"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "existing" | "new");
                  setSuccess(null);
                }}
              >
                <option value="existing">关联已有客户</option>
                <option value="new">手工建立已成交客户</option>
              </select>
            </label>
            {mode === "new" ? (
              <label className="block">
                新客户名称{" "}
                <input
                  aria-label="新客户名称"
                  className="rounded border p-2"
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            ) : (
              <>
                {customerId && (
                  <Link
                    className="block underline"
                    to={`/formal-customers?record=${customerId}`}
                  >
                    已选客户：{selectedCustomer.data?.name || "打开客户档案"}
                  </Link>
                )}
                <FormalCustomerSelector
                  value={customerId}
                  onSelect={(s) => {
                    setCustomerId(s.formalCustomerId);
                    setSuccess(null);
                  }}
                />
              </>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeHistory}
                onChange={(e) => setIncludeHistory(e.target.checked)}
              />
              将本订单明确关联的历史 Quote / PI 一并归档到该客户
            </label>
          </fieldset>
          {!plan && (
            <Button
              disabled={
                busy || (mode === "existing" ? !customerId : !name.trim())
              }
              onClick={() => void preview()}
            >
              预览归档范围
            </Button>
          )}
          {plan && (
            <div role="region" aria-label="确认客户归档" className="space-y-3">
              <p>
                {includeHistory
                  ? "是否将本订单关联的以下历史业务单据一并归档到该客户？"
                  : "确认只关联本订单？上游 Quote / PI 保持原关联。"}
              </p>
              <ul>
                {plan.documents
                  .filter((d) => includeHistory || d.resource_type === "order")
                  .map((d) => (
                    <li key={`${d.resource_type}-${d.id}`}>
                      {d.document_number}
                      {d.formal_customer_id &&
                        d.formal_customer_id !== customerId && (
                          <strong className="text-destructive">
                            {" "}
                            · 已关联其他客户，不能覆盖
                          </strong>
                        )}
                    </li>
                  ))}
              </ul>
              <p>
                {mode === "new"
                  ? `将明确新建客户：${name}`
                  : `归档到客户：${selectedCustomer.data?.name || "上方已选择的客户"}。`}{" "}
                此操作不会改写历史 snapshot。
              </p>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void confirm()}>
                  确认归档
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setPlan(null)}
                >
                  取消
                </Button>
              </div>
            </div>
          )}
          {failure && <p role="alert">{failure}</p>}
          {success && (
            <p role="status">
              客户关联已保存。
              <Link
                className="underline"
                to={`/formal-customers?record=${success}`}
              >
                打开客户业务档案
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
