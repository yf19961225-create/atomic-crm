import { useState } from "react";
import { Link } from "react-router";
import { useDataProvider, useRefresh, type RaRecord } from "ra-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { errorMessage } from "../outbound/RelatedRecords";
import { readRelated } from "../outbound/workflow";

export function CustomerHistory({ record }: { record: RaRecord }) {
  const provider = useDataProvider();
  const client = useQueryClient();
  const refresh = useRefresh();
  const {
    data = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["romiku-inquiry-history"],
    queryFn: () => readRelated(provider, "romiku_website_inquiries", {}),
  });
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const available = data.filter((inquiry) => !inquiry.formal_customer_id);
  const linked = data.filter(
    (inquiry) => String(inquiry.formal_customer_id) === String(record.id),
  );
  const link = async () => {
    const inquiry = available.find((item) => String(item.id) === selected);
    if (!inquiry) return;
    setBusy(true);
    setFailure("");
    try {
      await provider.update("romiku_website_inquiries", {
        id: inquiry.id,
        data: { formal_customer_id: record.id },
        previousData: inquiry,
      });
      setSelected("");
      await client.invalidateQueries({ queryKey: ["romiku-inquiry-history"] });
      refresh();
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        关联仅记录来源历史。除明确建立的关联外，原始询盘和外贸开发记录仍保持独立且不变。
      </p>
      {record.source_outbound_company_id && (
        <Link
          className="block underline"
          to={`/outbound-development?record=${encodeURIComponent(record.source_outbound_company_id)}`}
        >
          打开来源外贸开发公司
        </Link>
      )}
      {isPending && <p>正在加载询盘历史…</p>}
      {error && <p role="alert">无法加载询盘历史。</p>}
      <ul className="space-y-2">
        {linked.map((inquiry) => (
          <li key={inquiry.id}>
            <Link
              className="underline"
              to={`/website-inquiries?record=${encodeURIComponent(inquiry.id)}`}
            >
              {inquiry.document_number} · {inquiry.customer_name}
            </Link>
          </li>
        ))}
      </ul>
      {!isPending && !error && linked.length === 0 && (
        <p>暂无关联的网站询盘。</p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        要关联的网站询盘
        <select
          aria-label="要关联的网站询盘"
          className="rounded border p-2"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={isPending || !!error}
        >
          <option value="">请选择未关联的询盘</option>
          {available.map((inquiry) => (
            <option key={inquiry.id} value={inquiry.id}>
              {inquiry.document_number} · {inquiry.customer_name} ·{" "}
              {inquiry.email}
            </option>
          ))}
        </select>
      </label>
      <Button disabled={!selected || busy} onClick={link}>
        {busy ? "正在关联…" : "关联所选询盘"}
      </Button>
      {failure && <p role="alert">{failure}</p>}
    </div>
  );
}
