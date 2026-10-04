import { useGetOne, type Identifier } from "ra-core";
import { MarkingProfileEditor } from "./MarkingProfileEditor";
export function OrderProductionInstructions({ id }: { id: Identifier }) {
  const { data, error, isPending, refetch } = useGetOne("romiku_orders", {
    id,
  });
  if (isPending) return <p>正在加载订单生产默认值…</p>;
  if (error || !data)
    return (
      <p role="alert">
        无法读取订单生产默认值。
        <button onClick={() => void refetch()}>重试</button>
      </p>
    );
  return (
    <MarkingProfileEditor
      key={`${id}-${data.updated_at || ""}`}
      kind="order"
      record={data}
    />
  );
}
