import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDataProvider, useGetOne } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import {
  createQuote,
  quoteFromInquiry,
  quoteSourceResources,
  type QuoteSource,
} from "./quoteWorkflow";

export function QuoteCreate() {
  const [params] = useSearchParams();
  const initialSource = params.get("source");
  const [source, setSource] = useState<QuoteSource>(
    initialSource === "inquiry" ||
      initialSource === "outbound" ||
      initialSource === "customer"
      ? initialSource
      : "direct",
  );
  const [sourceId, setSourceId] = useState(params.get("sourceId") || "");
  const [buyer, setBuyer] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const provider = useDataProvider();
  const navigate = useNavigate();
  const choices = useQuery({
    queryKey: ["quote-source-choices", source],
    queryFn: () =>
      readRelated(
        provider,
        quoteSourceResources[source as Exclude<QuoteSource, "direct">],
        {},
      ),
    enabled: source !== "direct",
  });
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (source === "inquiry") return;
    setBusy(true);
    setFailure("");
    try {
      const result = await createQuote(provider, source, sourceId, buyer);
      navigate(`/quotes/${result.data.id}`);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="max-w-4xl space-y-5">
      <Link to="/quotes" className="underline">
        返回报价单
      </Link>
      <h1 className="text-3xl font-semibold">新建报价单</h1>
      <p className="text-muted-foreground">
        创建独立报价单。采购方和产品快照仅属于此报价单；不会创建正式客户。
      </p>
      <form onSubmit={create} className="space-y-4">
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            来源
            <select
              className="rounded border p-2"
              value={source}
              onChange={(event) => {
                setSource(event.target.value as QuoteSource);
                setSourceId("");
                setFailure("");
              }}
            >
              <option value="direct">直接创建</option>
              <option value="inquiry">网站询盘</option>
              <option value="outbound">主动开发</option>
              <option value="customer">正式客户</option>
            </select>
          </label>
          {source === "direct" ? (
            <label className="flex flex-col gap-1">
              采购方名称
              <input
                className="rounded border p-2"
                required
                value={buyer}
                onChange={(event) => setBuyer(event.target.value)}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              来源记录
              <select
                className="rounded border p-2"
                required
                disabled={choices.isPending || !!choices.error}
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">请选择记录</option>
                {choices.data?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.document_number
                      ? `${row.document_number} · ${row.customer_name}`
                      : row.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        {source !== "direct" && choices.error && (
          <p role="alert">无法加载来源记录。</p>
        )}
        {source !== "inquiry" && (
          <Button
            type="submit"
            disabled={
              busy ||
              (source !== "direct" &&
                (!sourceId || choices.isPending || !!choices.error))
            }
          >
            {busy ? "创建中…" : "创建报价单"}
          </Button>
        )}
        {failure && <p role="alert">{failure}</p>}
      </form>
      {source === "inquiry" && sourceId && (
        <InquiryConfirmation
          key={sourceId}
          inquiryId={sourceId}
          onCreated={(id) => navigate(`/quotes/${id}`)}
        />
      )}
    </section>
  );
}

function InquiryConfirmation({
  inquiryId,
  onCreated,
}: {
  inquiryId: string;
  onCreated: (id: string) => void;
}) {
  const provider = useDataProvider();
  const inquiry = useGetOne("romiku_website_inquiries", { id: inquiryId });
  const items = useQuery({
    queryKey: ["quote-original-items", inquiryId],
    queryFn: () =>
      readRelated(provider, "romiku_website_inquiry_items", {
        inquiry_id: inquiryId,
      }),
  });
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const selected = (items.data || [])
    .filter((item) => !excluded.includes(String(item.id)))
    .map((item) => String(item.id));
  const confirm = async () => {
    setBusy(true);
    setFailure("");
    try {
      onCreated(
        await quoteFromInquiry(getSupabaseClient(), inquiryId, selected),
      );
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  if (inquiry.isPending || items.isPending) return <p>正在加载原始询盘…</p>;
  if (inquiry.error || items.error || !inquiry.data)
    return <p role="alert">无法加载原始询盘。</p>;
  return (
    <section className="space-y-4 rounded border p-4">
      <h2 className="text-xl font-semibold">确认询盘产品项</h2>
      <p>
        {inquiry.data.document_number} · {inquiry.data.customer_name} ·{" "}
        {inquiry.data.email}
      </p>
      <p className="text-muted-foreground text-sm">
        可选择全部或部分产品项。确认后将选中的原始产品项复制到新的报价单；之后可
        编辑报价单副本。
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setExcluded([])}>
            全选
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setExcluded((items.data || []).map((item) => String(item.id)))
            }
          >
            清除选择
          </Button>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>包含</th>
              <th>SKU</th>
              <th>原始数量</th>
              <th>原始要求</th>
            </tr>
          </thead>
          <tbody>
            {items.data?.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="py-3">
                  <input
                    type="checkbox"
                    aria-label={`包含 ${item.sku}`}
                    checked={!excluded.includes(String(item.id))}
                    onChange={(event) =>
                      setExcluded(
                        event.target.checked
                          ? excluded.filter((id) => id !== String(item.id))
                          : [...excluded, String(item.id)],
                      )
                    }
                  />
                </td>
                <td>{item.sku}</td>
                <td>{item.quantity}</td>
                <td>{item.requirement || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.data?.length && <p>此询盘没有可报价的产品项。</p>}
        <p>已选择 {selected.length} 项</p>
        <Button onClick={confirm} disabled={!selected.length || busy}>
          {busy ? "正在创建快照…" : "确认并创建报价单"}
        </Button>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
