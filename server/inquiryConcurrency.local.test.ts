import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

// A disposable database inside the named local Supabase container. No network,
// remote credentials, copied customer data, or changes to the shared test stack.
it.skipIf(process.env.ROMIKU_TEST_LOCAL_DB !== "1")(
  "concurrent normalized intake and changed retries commit exactly one original snapshot",
  async () => {
    const container = "supabase_db_atomic-crm-demo";
    const database = `inquiry_concurrency_${randomUUID().replaceAll("-", "")}`;
    const psql = (sql: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          container,
          "psql",
          "-U",
          "supabase_admin",
          "-d",
          database,
          "-v",
          "ON_ERROR_STOP=1",
          "-X",
          "-qAt",
        ],
        { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
    execFileSync("docker", [
      "exec",
      container,
      "createdb",
      "-U",
      "postgres",
      database,
    ]);
    try {
      const schema = execFileSync(
        "docker",
        [
          "exec",
          container,
          "pg_dump",
          "-U",
          "postgres",
          "--schema-only",
          "--no-owner",
          "postgres",
        ],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
      psql(schema);
      // The existing stack deliberately stays at its shared baseline. Apply the
      // subsequent migrations only in this private throwaway database.
      const migrations = readdirSync("supabase/migrations")
        .filter(
          (name) =>
            name >= "20261003150000" &&
            name <= "20261006190000_inquiry_quote_snapshots.sql",
        )
        .sort();
      psql(
        migrations
          .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
          .join("\n"),
      );
      const submissionId = randomUUID();
      const original = {
        submissionId,
        customerName: "Concurrency Original",
        company: "Original company",
        brand: "Original brand",
        email: "same@example.test",
        country: "Colombia",
        message: "Original",
        items: [
          {
            sku: "SUN5",
            productName: "Original lamp",
            image: "",
            specification: "48W",
            quantity: 120.1234,
            requirement: "",
          },
        ],
      };
      const sql = (body: unknown, pause = false) =>
        `begin; set local role service_role; select row_to_json(r) from public.romiku_submit_website_inquiry('${JSON.stringify(body).replaceAll("'", "''")}'::jsonb) r; ${pause ? "select pg_sleep(1);" : ""} commit;`;
      const start = (statement: string) => {
        const child = spawn("docker", [
          "exec",
          "-i",
          container,
          "psql",
          "-U",
          "supabase_admin",
          "-d",
          database,
          "-v",
          "ON_ERROR_STOP=1",
          "-X",
          "-qAt",
        ]);
        let stdout = "",
          stderr = "";
        let ready!: () => void;
        const firstOutput = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const completion = new Promise<Record<string, unknown>>(
          (resolve, reject) => {
            child.stdout.on("data", (chunk) => {
              stdout += String(chunk);
              if (stdout.includes('"document_number"')) ready();
            });
            child.stderr.on("data", (chunk) => {
              stderr += String(chunk);
            });
            child.on("error", reject);
            child.on("exit", (code) => {
              if (code !== 0) reject(new Error(stderr));
              else
                resolve(
                  JSON.parse(
                    stdout.split("\n").find((line) => line.startsWith("{"))!,
                  ),
                );
            });
          },
        );
        child.stdin.end(statement);
        return { completion, firstOutput };
      };
      const first = start(sql(original, true));
      await first.firstOutput; // First transaction still owns its submission lock.
      const changed = {
        ...original,
        company: "Altered retry",
        items: [{ ...original.items[0], quantity: 999 }],
      };
      const retries = Array.from(
        { length: 4 },
        () => start(sql(changed)).completion,
      );
      const [saved, ...receipts] = await Promise.all([
        first.completion,
        ...retries,
      ]);
      expect(saved.replay).toBe(false);
      for (const receipt of receipts) {
        expect(receipt).toEqual({ ...saved, replay: true });
        expect(receipt.normalizedSubmission).toEqual(original);
      }
      expect(
        psql(
          `select count(*) from public.romiku_website_inquiries where submission_id='${submissionId}';`,
        ).trim(),
      ).toBe("1");
      expect(
        psql(
          `select count(*) from public.romiku_status_history where resource_id='${saved.id}';`,
        ).trim(),
      ).toBe("1");
      const another = await start(
        sql({ ...original, submissionId: randomUUID() }),
      ).completion;
      expect(another.id).not.toBe(saved.id);
      expect(another.replay).toBe(false);
    } finally {
      execFileSync("docker", [
        "exec",
        container,
        "dropdb",
        "-U",
        "postgres",
        "--force",
        database,
      ]);
    }
  },
  60_000,
);
