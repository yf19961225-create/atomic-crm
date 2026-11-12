# Packing atomic-save audit

Baseline: 04dbc592. Read-only source audit; no database/network access, application code changes, or migration application. Line references refer to this baseline.

## Existing entry points

- `src/components/romiku/packing/PackingCreate.tsx:25–46`: Order mode calls `createOrderPackingList`; independent mode directly creates header `{order_id:null,packing_at,seller_snapshot,buyer_snapshot:{}}`, then navigates. No request identity/revision.
- `packing/packingWorkflow.ts:166–238`: Order creation concurrently reads Order, source items and remaining view, loads supplier defaults, creates header, sequentially creates all positive-remainder lines. Failure deletes already-created lines then header as compensation. A response lost after write is not in `created`, so compensation cannot guarantee cleanup. Empty eligible list still creates header.
- `production/FulfillmentPages.tsx:385–390,454–485`: header save independently updates name, batch_label, packing_at, shipping_mark, notes, seller_snapshot, buyer_snapshot. `PackingExportDetails.tsx:8–14,34–44` edits company_name/address/tel_whatsapp/website/email while retaining other snapshot keys. Header save does not include grid drafts.
- `packing/PackingItemsGrid.tsx:129–142,278–330`: local full draft; Save sequentially saves every draft row, then deletes removed rows, then refreshes. Failure can leave any prefix committed. `useDocumentSaveAttempt` only blocks further save pending reconciliation; it does not provide transaction/revision identity. Child receives `onSaved=items.refetch` (`FulfillmentPages.tsx:653–656`), so a successful item save does not refresh parent revision.
- `production/FulfillmentItems.tsx:254–266`: legacy shared form also calls savePackingItem; preserve this helper's callers or migrate them deliberately. Current Packing detail uses PackingItemsGrid.
- List/detail status actions and controlled deletion operate independently of these save buttons; header revision must change on those writes too.

## Stored shape and preserved rules

`supabase/schemas/01_tables.sql:768–815,871`:

- Header: id, document_number, name, order_id nullable, packing_at required, shipping_mark, batch_label, notes, seller_snapshot, buyer_snapshot, archived_at, status (`draft/incomplete/completed/sent`), owner/audit fields.
- Item: id, packing_list_id, position nullable positive integer, order_id/source_order_item_id both null or both present, sanity_product_id, sku required, product_snapshot, quantity numeric(18,4)>0, cartons integer>=0, qty_per_carton nullable numeric(18,4)>0, dimensions and carton_weight_kg numeric(12,4)>=0, remark, owner/audit fields.
- total_cbm and total_weight_kg are generated columns: L×W×H×cartons/1,000,000 and carton_weight_kg×cartons. Never accept these from payload.
- FK pairs enforce source belongs to Order and non-null item Order matches Packing Order. **Gap:** null source/order item can currently belong to an Order-backed header because composite FK skips null; new RPC must explicitly enforce parity with parent.
- No persisted carton-number/range field exists. Grid `no`/export `position` is line sequence, not carton serial number. Do not invent carton numbering requirements.
- `packingWorkflow.ts:27–52`: legacy null-position rows sort first by id, then positioned rows by position/id. Position is not unique. New rows choose max(count,max position)+1, a race outside a transaction.
- `packingWorkflow.ts:64–69,273–295`: configured cartons>0 and qty_per_carton>0 imply quantity=round(cartons×qty_per_carton,4); unconfigured imported line retains positive source remainder. Grid explicitly sends computed quantity (`PackingItemsGrid.tsx:302`), so saving an unconfigured zero-carton row currently fails positive-quantity validation. Atomic validation must deliberately preserve import fallback and distinguish grid save semantics.
- `packingWorkflow.ts:73–116`: source packing_snapshot positive values take precedence over supplier defaults. Saved cartons transfer only if source quantity exactly equals remaining quantity and cartons×qty_per_carton equals it; otherwise cartons=0. Supplier selection is preferred match or sole match (`132–158`).
- Source identity of existing item is immutable (`258–272` and SQL trigger). For Order-backed items sku comes from previous/source; product_snapshot merges previous/source with edits, including unit normalization (`314–337`). Independent items require nonblank sku and no source (`340–364`). Existing helper preserves sanity_product_id on edits.
- `03_views.sql:174–186`: remaining sums **all** Packing items, including archived Packing headers and every status. Production quantities are a separate calculation; do not subtract production allocations from packing availability.
- `packingExportModel.ts:77–131`: exports saved snapshot/quantity/generated totals, sorted by position then id. It does not export draft edits or derive persisted quantity from cartons.

## Concurrency and old-client compatibility

- `02_functions.sql:685–723`: packing quantity trigger requires READ COMMITTED, disallows source/parent changes, locks source Order item FOR UPDATE, then reads fresh SUM excluding current id and rejects over-allocation. No lock on Packing header; DELETE does not enter this trigger.
- `02_functions.sql:725–738`: Order item quantity cannot drop below packed sum; requires READ COMMITTED.
- `04_triggers.sql:123–127`: commercial item writes lock their document parent, but Packing has no such trigger. Existing Order UPDATE first obtains its item tuple lock then trigger parent lock; an RPC that locks Order header then waits on that item can deadlock with a legacy direct update. Sorted RPC locks alone cannot eliminate this legacy tuple-before-trigger inversion.
- `02_functions.sql:1034–1049,1079`: controlled delete checks authenticated identity, locks Packing header, then deletes items and header. It must participate in the same cross-document order if new revision/allocation triggers acquire upstream locks.
- Recommended new RPC lock protocol: request record → upstream Order header (when applicable) → Packing header → affected Order item ids sorted → existing Packing item ids sorted. Apply this consistently to Order atomic save and controlled Packing deletion. Avoid obtaining upstream locks after Packing header in a competing route. For unavoidable legacy inversions, PostgreSQL 40P01/40001 must be classified as transaction rollback/retryable, using unchanged request identity; never report as saved.
- A legacy Packing insert/update/delete must bump/serialize Packing revision, and all header/status/archive writes must bump revision. Without that, expected_revision accepts stale whole-document payloads and overwrites legacy edits. Merely adding a parent lock is insufficient: after waiting, a legacy full stale update has no expected revision and remains last-writer-wins. Keep that compatibility limitation explicit, or reject old mutation routes with a clear upgrade response.
- Do not disable quantity triggers. To avoid transient false over-allocation within a valid batch, delete omitted rows and apply decreases before increases/new rows (all source locks already held). Also validate final aggregate per source, including multiple payload lines with the same source.
- Auth RLS is broad authenticated access (`05_policies.sql:191–199`); do not accidentally promise owner isolation. New request/result ledger must isolate by auth user even though business records are shared.

## Minimal complete transaction payload

```ts
{
  request_id: UUID,                 // persistent across uncertain retries
  document_id: UUID | null,         // null only for create
  expected_revision: number | null,// required for update
  header: {
    order_id?: UUID | null,         // create only; immutable on update
    name?: string | null,
    packing_at: string,
    shipping_mark?: string | null,
    batch_label?: string | null,
    notes?: string | null,
    seller_snapshot: object,
    buyer_snapshot: object
  },
  items: [{
    id: UUID,                      // stable client UUID for newly drafted rows too
    position: number | null,
    source_order_item_id: UUID | null,
    sanity_product_id: string | null,
    sku: string,
    product_snapshot: object,
    quantity: number,               // fallback for unconfigured Order import
    cartons: number,
    qty_per_carton: number | null,
    length_cm: number,
    width_cm: number,
    height_cm: number,
    carton_weight_kg: number,
    remark: string | null
  }]
}
```

Treat `items` as authoritative membership: omission deletes; require the array, reject duplicate ids, reject existing foreign-document ids, reject source changes. Server derives packing_list_id/order_id from parent and verifies every source. Do not accept numbering, audit/owner/generated columns. Header status/archive should either be explicitly included with established business validation or preserved server-side when absent; never reset them by default on edit.

Use JSONB canonical payload hash computed server-side; key it with authenticated actor + request_id, compare kind/document/hash on reuse. Persist success `{document_id,revision,header,items}` in the same transaction, query it by request_id after uncertain response, return identical result for same payload, reject changed payload under same id. Result lookup must not expose another user's requests. Validation rollback can return structured conflict/error without consuming success identity; durable failed-attempt semantics require deliberate exception/subtransaction handling.

UI integration needs lifted header+items draft and one document Save to actually promise header+items atomicity. If keeping separate Save buttons, each RPC must be explicit patch scope or use a fresh full snapshot and revision without silently dropping the other unsaved draft. Item result must update parent revision; otherwise next header save conflicts with its own successful item save.

## Minimum local verification cases

1. Failure on any item rolls back header, all rows and revision; uncertain success lookup returns original result, retry does not allocate twice.
2. Two packings compete for same remainder; one rejected without partial rows. Multiple source ids in inverse payload order do not deadlock across RPCs.
3. Same source in two payload rows; decrease/delete before increase works when final allocation fits. Archived/status changes do not release quantity.
4. Stale expected_revision after header, legacy item, status or archive mutation conflicts. Own item save refreshes revision for subsequent header save.
5. Independent create and Order create (zero eligible lines too); invalid source/parity, duplicate/foreign ids, source mutation, nonfinite/negative inputs and numeric overflow fail atomically.
6. Generated CBM/weight, nullable qty_per_carton, preserved historical null positions, line ordering, snapshot extra keys and seller/buyer exports match existing behavior.
7. Old direct Order item UPDATE vs new Packing save, and controlled Packing delete vs new save, exercise 40P01 handling and absence of silent data loss.

## Local implementation follow-up

The delegated scope subsequently included frontend implementation. Packing creation now freezes a prepared full payload and submits one atomic request, with persisted creation identity and explicit result lookup. Grid save submits one complete item set (`header:{}`); header save submits `items:null`. Detail loading gets coherent header/items via snapshot RPC. A dirty editor retains its captured revision across refreshes. No direct row compensation remains. Legacy `savePackingItem` now routes through atomic save with the caller's revision.

New and adapted tests explicitly use the atomic provider contract/test double; no production FakeRest fallback was added. Verified locally: 6 Packing/fulfillment files, 39 tests passed (Vitest browser project `app`, 2026-11-11). Database transaction/locking tests remain owned by the server implementation task. Header and grid retain separate Save controls; editing both and saving one can leave the other with an older captured revision, yielding a safe conflict rather than silently rebasing pending work.
