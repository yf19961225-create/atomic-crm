import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DataProvider, RaRecord } from "ra-core";
import endpoint from "../api/website-inquiries";
import { syncNextFollowup } from "../src/components/romiku/outbound/workflow";
import { createProductionOrders } from "../src/components/romiku/production/productionWorkflow";
import { savePackingItem } from "../src/components/romiku/packing/packingWorkflow";
import { assertLocalSmokeTarget } from "./localSmokeTarget";

// No shared Atomic fixtures: those delete all Auth users. This workflow owns and
// cleans only UUID-marked local users and their records, including on failure.
test("Today MVP: two real users, independent snapshots and fulfillment", async ({
  browser,
  baseURL,
}) => {
  const local = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  assertLocalSmokeTarget(baseURL!, local.API_URL);
  const authOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
  };
  const admin = createClient(
    local.API_URL,
    local.SERVICE_ROLE_KEY,
    authOptions,
  );
  const clients = [0, 1].map(() =>
    createClient(local.API_URL, local.ANON_KEY, authOptions),
  );
  const marker = randomUUID();
  const password = `Local-only-${randomUUID()}`;
  const emails = [0, 1].map((i) => `today-${marker}-${i}@example.test`);
  const users: string[] = [];
  const contexts: BrowserContext[] = [];
  let inquiryId: string | undefined;
  const must = async <T extends { data: unknown; error: unknown }>(
    request: PromiseLike<T>,
  ): Promise<NonNullable<T["data"]>> => {
    const result = await request;
    if (result.error) throw result.error;
    return result.data!;
  };
  const providerFor = (client: SupabaseClient) =>
    ({
      getList: async (
        resource: string,
        {
          filter,
          pagination,
        }: {
          filter: Record<string, unknown>;
          pagination: { page: number; perPage: number };
        },
      ) => {
        const { page, perPage } = pagination;
        const data = await must(
          client
            .from(resource)
            .select("*")
            .match(filter)
            .order("id")
            .range((page - 1) * perPage, page * perPage - 1),
        );
        return { data };
      },
      getOne: async (resource: string, { id }: { id: string }) => ({
        data: await must(
          client.from(resource).select("*").eq("id", id).single(),
        ),
      }),
      create: async (
        resource: string,
        { data }: { data: Record<string, unknown> },
      ) => ({
        data: await must(client.from(resource).insert(data).select().single()),
      }),
      update: async (
        resource: string,
        { id, data }: { id: string; data: Record<string, unknown> },
      ) => ({
        data: await must(
          client.from(resource).update(data).eq("id", id).select().single(),
        ),
      }),
    }) as unknown as DataProvider;
  try {
    await test.step("Create and sign in two independent Auth accounts", async () => {
      for (const [i, client] of clients.entries()) {
        const { user } = await must(
          admin.auth.admin.createUser({
            email: emails[i],
            password,
            email_confirm: true,
            user_metadata: { first_name: `Smoke ${i + 1}`, last_name: "User" },
          }),
        );
        if (!user || !/^[0-9a-f-]{36}$/.test(user.id))
          throw new Error("Invalid fixture UUID");
        users.push(user.id);
        await must(
          client.auth.signInWithPassword({ email: emails[i], password }),
        );
      }
      expect(users[0]).not.toBe(users[1]);
    });
    const first = clients[0];
    const second = clients[1];
    const provider = providerFor(first);
    const create = async (table: string, data: Record<string, unknown>) =>
      (await provider.create(table, { data })).data;
    const read = async (table: string, id: string) =>
      (await provider.getOne(table, { id })).data;
    const rows = (table: string, key: string, id: string) =>
      must(first.from(table).select("*").eq(key, id).order("id"));
    const edit = async (
      table: string,
      row: RaRecord,
      data: Record<string, unknown>,
    ) => provider.update(table, { id: row.id, data, previousData: row });
    const outbound = await create("romiku_outbound_companies", {
      name: `Smoke ${marker}`,
    });
    await test.step("Outbound contact and follow-up persist with no Customer conversion", async () => {
      const contact = await create("romiku_outbound_contacts", {
        outbound_company_id: outbound.id,
        name: "Buyer",
        email: "buyer@example.test",
      });
      await create("romiku_outbound_followups", {
        outbound_company_id: outbound.id,
        contact_id: contact.id,
        method: "Email",
        summary: "Sample requested",
        next_follow_up_at: new Date(Date.now() - 3600_000).toISOString(),
      });
      await syncNextFollowup(provider, "outbound", outbound.id);
      expect(
        (await read("romiku_outbound_companies", String(outbound.id)))
          .next_follow_up_at,
      ).toBeTruthy();
      expect(
        await rows(
          "romiku_outbound_contacts",
          "outbound_company_id",
          String(outbound.id),
        ),
      ).toHaveLength(1);
      expect(
        await rows("romiku_formal_customers", "created_by", users[0]),
      ).toHaveLength(0);
    });
    await test.step("Actual intake handler writes raw payload and original inquiry items", async () => {
      const savedEnv = { ...process.env };
      const realFetch = globalThis.fetch;
      process.env.WEBSITE_INQUIRY_SECRET = password;
      process.env.SUPABASE_URL = local.API_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = local.SERVICE_ROLE_KEY;
      // Only optional external catalog enrichment is offline. Persistence and
      // authentication call the real local services, through the real handler.
      globalThis.fetch = (input, init) => {
        if (!String(input).startsWith(`${local.API_URL}/`))
          return Promise.reject(
            new Error("External enrichment offline in local smoke"),
          );
        return realFetch(input, init);
      };
      const payload = {
        customerName: "Smoke buyer",
        email: "buyer@example.test",
        whatsapp: "+57 123",
        country: "Colombia",
        message: "Original request",
        task10Fixture: marker,
        items: [
          { sku: "SMOKE-A", quantity: 20, requirement: "White" },
          { sku: "SMOKE-B", quantity: 10, requirement: "Blue" },
        ],
      };
      try {
        const response = await endpoint.fetch(
          new Request(`${baseURL}/api/website-inquiries`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-ROMIKU-Website-Secret": password,
            },
            body: JSON.stringify(payload),
          }),
        );
        expect(response.status).toBe(201);
        const receipt = await response.json();
        inquiryId = receipt.id;
        expect(
          (await read("romiku_website_inquiries", inquiryId!)).raw_payload,
        ).toEqual(payload);
      } finally {
        globalThis.fetch = realFetch;
        for (const key of [
          "WEBSITE_INQUIRY_SECRET",
          "SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ]) {
          if (savedEnv[key] === undefined) delete process.env[key];
          else process.env[key] = savedEnv[key];
        }
      }
    });
    const inquiryBefore = await read("romiku_website_inquiries", inquiryId!);
    const originals = await rows(
      "romiku_website_inquiry_items",
      "inquiry_id",
      inquiryId!,
    );
    expect(
      originals.map((i) => [i.sku, i.quantity, i.requirement]).sort(),
    ).toEqual([
      ["SMOKE-A", 20, "White"],
      ["SMOKE-B", 10, "Blue"],
    ]);
    const quoteId = await must(
      first.rpc("romiku_quote_from_inquiry", {
        inquiry_id: inquiryId,
        selected_item_ids: originals.map((i) => i.id),
      }),
    );
    const quoteItems = await rows("romiku_quote_items", "quote_id", quoteId);
    await edit("romiku_quote_items", quoteItems[0], {
      quantity: 30,
      unit_price: 2,
    });
    await edit("romiku_quote_items", quoteItems[1], {
      quantity: 10,
      unit_price: 3,
    });
    await test.step("Inquiry → Quote edits preserve every original field", async () => {
      expect(await read("romiku_website_inquiries", inquiryId!)).toEqual(
        inquiryBefore,
      );
      expect(
        await rows("romiku_website_inquiry_items", "inquiry_id", inquiryId!),
      ).toEqual(originals);
    });
    const quoteBefore = await read("romiku_quotes", quoteId);
    const quoteItemsBefore = await rows(
      "romiku_quote_items",
      "quote_id",
      quoteId,
    );
    const piId = await must(
      first.rpc("romiku_convert_document", {
        source_kind: "quote",
        source_id: quoteId,
        target_kind: "pi",
      }),
    );
    const piItems = await rows("romiku_pi_items", "pi_id", piId);
    await edit("romiku_pi_items", piItems[0], { quantity: 40 });
    await test.step("Quote → PI edits preserve Quote header and items", async () => {
      expect(await read("romiku_quotes", quoteId)).toEqual(quoteBefore);
      expect(await rows("romiku_quote_items", "quote_id", quoteId)).toEqual(
        quoteItemsBefore,
      );
    });
    const piBefore = await read("romiku_pis", piId);
    const piItemsBefore = await rows("romiku_pi_items", "pi_id", piId);
    const orderId = await must(
      first.rpc("romiku_convert_document", {
        source_kind: "pi",
        source_id: piId,
        target_kind: "order",
      }),
    );
    const orderItems = await rows("romiku_order_items", "order_id", orderId);
    await edit("romiku_order_items", orderItems[0], {
      quantity: 50,
      unit_price: 2,
    });
    await edit("romiku_order_items", orderItems[1], {
      quantity: 10,
      unit_price: 3,
    });
    await test.step("PI → Order edits preserve PI header and items", async () => {
      expect(await read("romiku_pis", piId)).toEqual(piBefore);
      expect(await rows("romiku_pi_items", "pi_id", piId)).toEqual(
        piItemsBefore,
      );
    });
    const orderBefore = await read("romiku_orders", orderId);
    const orderItemsBefore = await rows(
      "romiku_order_items",
      "order_id",
      orderId,
    );
    await test.step("Payment updates server-derived remaining balance", async () => {
      await create("romiku_payments", {
        order_id: orderId,
        kind: "deposit",
        amount: 30,
      });
      expect(await read("romiku_order_totals", orderId)).toMatchObject({
        total: 130,
        remaining_amount: 100,
      });
    });
    await test.step("Production groups two source items into separate supplier documents", async () => {
      const suppliers = [
        await create("romiku_suppliers", { name: "Smoke Factory A" }),
        await create("romiku_suppliers", { name: "Smoke Factory B" }),
      ];
      const production = await createProductionOrders(
        provider,
        orderId,
        orderItemsBefore.map((item, i) => ({
          itemId: item.id,
          supplierId: String(suppliers[i].id),
          quantity: item.quantity,
        })),
      );
      expect(production).toHaveLength(2);
      expect(new Set(production.map((p) => p.supplier_id)).size).toBe(2);
      for (const document of production)
        expect(
          await rows(
            "romiku_production_items",
            "production_order_id",
            String(document.id),
          ),
        ).toHaveLength(1);
    });
    await test.step("Partial packing derives remainder and never changes Order", async () => {
      const packing = await create("romiku_packing_lists", {
        order_id: orderId,
      });
      await savePackingItem(provider, packing, orderItemsBefore[0].id, {
        quantity: 20,
        cartons: 2,
        length_cm: 50,
        width_cm: 40,
        height_cm: 30,
        carton_weight_kg: 10,
      });
      expect(
        await read("romiku_order_item_remaining", orderItemsBefore[0].id),
      ).toMatchObject({ remaining_quantity: 30 });
      expect(
        await read("romiku_packing_totals", String(packing.id)),
      ).toMatchObject({ total_cbm: 0.12, total_weight_kg: 20 });
      expect(await read("romiku_orders", orderId)).toEqual(orderBefore);
      expect(await rows("romiku_order_items", "order_id", orderId)).toEqual(
        orderItemsBefore,
      );
    });
    await test.step("Second user shares read/write access with correct audit; anon is denied", async () => {
      const changed = await must(
        second
          .from("romiku_outbound_companies")
          .update({ notes: "Second user edit" })
          .eq("id", outbound.id)
          .select()
          .single(),
      );
      expect(changed).toMatchObject({
        created_by: users[0],
        updated_by: users[1],
      });
      expect(
        (
          await must(
            second.from("romiku_orders").select("*").eq("id", orderId).single(),
          )
        ).document_number,
      ).toBe(orderBefore.document_number);
      const anonymous = createClient(
        local.API_URL,
        local.ANON_KEY,
        authOptions,
      );
      expect(
        (await anonymous.from("romiku_orders").select("id")).error,
      ).toBeTruthy();
    });
    await test.step("Both users sign in through UI and follow Workbench / Calendar source links", async () => {
      for (const email of emails) {
        const context = await browser.newContext();
        contexts.push(context);
        const page = await context.newPage();
        await page.goto(baseURL!);
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Password").fill(password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Workbench", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("link", { name: String(outbound.name), exact: true })
          .click();
        await expect(
          page.getByLabel("Company name", { exact: true }),
        ).toHaveValue(String(outbound.name));
        await page.goto(`${baseURL}/#/calendar`);
        await expect(
          page.getByRole("heading", { name: "Calendar", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "All dates", exact: true })
          .click();
        await page
          .getByRole("link", { name: String(outbound.name), exact: true })
          .click();
        await expect(
          page.getByLabel("Company name", { exact: true }),
        ).toHaveValue(String(outbound.name));
      }
    });
  } finally {
    for (const context of contexts) await context.close();
    if (users.length) {
      const tables = [
        "romiku_packing_items",
        "romiku_packing_lists",
        "romiku_production_items",
        "romiku_production_orders",
        "romiku_payments",
        "romiku_order_items",
        "romiku_orders",
        "romiku_pi_items",
        "romiku_pis",
        "romiku_quote_items",
        "romiku_quotes",
        "romiku_outbound_followups",
        "romiku_outbound_contacts",
        "romiku_outbound_companies",
        "romiku_suppliers",
      ];
      const actorIds = users.map((id) => `'${id}'`).join(",");
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_atomic-crm-demo",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        {
          input: `BEGIN; SET LOCAL session_replication_role=replica;
          ${tables.map((table) => `DELETE FROM public.${table} WHERE created_by IN (${actorIds});`).join("\n")}
          DELETE FROM public.romiku_website_inquiry_items WHERE inquiry_id IN (SELECT id FROM public.romiku_website_inquiries WHERE raw_payload->>'task10Fixture'='${marker}');
          DELETE FROM public.romiku_website_inquiries WHERE raw_payload->>'task10Fixture'='${marker}';
          DELETE FROM public.sales WHERE user_id IN (${actorIds}); COMMIT;`,
          stdio: ["pipe", "ignore", "pipe"],
        },
      );
      for (const id of users) await must(admin.auth.admin.deleteUser(id));
    }
  }
});
