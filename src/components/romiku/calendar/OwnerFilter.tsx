import { useState } from "react";
import { useDataProvider, useGetIdentity } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { readRelated } from "../outbound/workflow";

export function useOwners() {
  const provider = useDataProvider();
  const { data: identity } = useGetIdentity();
  const query = useQuery({
    queryKey: ["romiku-owners"],
    queryFn: () => readRelated(provider, "sales", {}),
  });
  const owners = query.data || [];
  // Atomic identity.id is the numeric sales record, while ROMIKU owner_id is auth.users UUID.
  const mine = owners.find((owner) => String(owner.id) === String(identity?.id))
    ?.user_id as string | undefined;
  return { ...query, owners, mine };
}
export function useOwnerFilter() {
  const [owner, setOwner] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const owners = useOwners();
  return {
    ...owners,
    owner,
    setOwner,
    onlyMine,
    setOnlyMine,
    effectiveOwner: onlyMine ? owners.mine || "unresolved-current-user" : owner,
  };
}
export function OwnerFilter({
  state,
}: {
  state: ReturnType<typeof useOwnerFilter>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label>
        负责人{" "}
        <select
          aria-label="负责人"
          className="rounded border p-2"
          value={state.owner}
          disabled={state.onlyMine || state.isPending || !!state.error}
          onChange={(e) => state.setOwner(e.target.value)}
        >
          <option value="">全部负责人</option>
          {state.owners.map((o) => (
            <option key={o.id} value={o.user_id}>
              {o.first_name} {o.last_name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={state.onlyMine}
          disabled={!state.mine}
          onChange={(e) => state.setOnlyMine(e.target.checked)}
        />
        仅看我的
      </label>
      {state.error && (
        <p role="alert">
          无法加载负责人。{" "}
          <button onClick={() => state.refetch()}>重试加载负责人</button>
        </p>
      )}
    </div>
  );
}
