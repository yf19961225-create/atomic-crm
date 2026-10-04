# Formal Customer 360

Formal Customer represents an explicitly confirmed customer after an order. Preserve optional Quote/PI/Order provenance, mandatory Order→Production, optional Order→Packing, immutable historical snapshots and all five XLSX renderers/templates.

Reuse customer FK and real source chains only. Add a security-invoker membership view (no copied business data), reusable indexed search hits, paginated customer history RPC (10 Orders), paginated all-document RPC, and an atomic confirmation RPC to attach an Order and optionally its exact Quote/PI chain. No independent Packing is attributable: its schema has no customer FK. Contacts come from the customer contact table. Customer metadata remains in existing fields/JSON.

History returns Order cards with real sources and all child headers/payment summaries in one request; expandable payment records arrive in the same page. Customer search scopes before pagination and matches own document/item snapshots using existing indexed search. Shared source documents deduplicate in all-documents, but can appear under each explicitly linked Order. A source linked to another customer is flagged rather than reassigned. Archive confirmation uses an expected source-chain token and row locks; updates only formal_customer_id, never saved snapshots. Customer creation during confirmed archive is explicit and transactional. No automatic customer creation/backfill.

Summary groups Order totals by currency, excludes cancelled orders from monetary totals, includes all existing archive visibility, and labels this behavior. In-progress excludes draft/cancelled/completed. Latest order sorted document_date DESC, created_at DESC, id. UI provides three top-level tabs, order-based collapsibles, links using document numbers, per-customer search, no per-Order HTTP queries.

Preview only ciwaibtotispazfviims; Vercel project romiku-crm-prod preview deployments only. No Production/Sanity/domain changes. No .gitignore, output, or .vitest-attachments commits.
