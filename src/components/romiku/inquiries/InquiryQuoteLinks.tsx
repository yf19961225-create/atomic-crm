import { useState } from "react";
import { useGetList, useGetOne } from "ra-core";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function QuoteInquirySource({ inquiryId }: { inquiryId: string }) {
  const { data } = useGetOne("romiku_website_inquiries", { id: inquiryId });
  return (
    <Link
      className="underline"
      to={`/website-inquiries?record=${encodeURIComponent(inquiryId)}`}
    >
      来源网站询盘：{data?.document_number || "查看询盘"}
    </Link>
  );
}
export function InquiryQuoteLinks({ inquiryId }: { inquiryId: string }) {
  const [page, setPage] = useState(1);
  const {
    data = [],
    total,
    isPending,
    error,
  } = useGetList("romiku_quotes", {
    filter: { source_website_inquiry_id: inquiryId },
    pagination: { page, perPage: 20 },
    sort: { field: "created_at", order: "DESC" },
  });
  return (
    <section
      aria-label="已创建报价单"
      className="space-y-2 rounded border p-3 text-sm"
    >
      <h3 className="font-medium">已创建报价单</h3>
      {isPending ? (
        <p>正在加载报价单…</p>
      ) : error ? (
        <p role="alert">报价单来源记录加载失败。</p>
      ) : data.length ? (
        <ul className="flex flex-wrap gap-3">
          {data.map((quote) => (
            <li key={quote.id}>
              <Link
                className="underline"
                to={`/quotes/${encodeURIComponent(quote.id)}`}
              >
                {quote.document_number || "查看报价单"}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">尚未创建报价单</p>
      )}
      {(page > 1 || (total ?? 0) > 20) && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            上一页报价单
          </Button>
          <Button
            variant="outline"
            disabled={page * 20 >= (total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            下一页报价单
          </Button>
        </div>
      )}
    </section>
  );
}
