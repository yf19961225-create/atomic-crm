import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

const container = "supabase_db_atomic-crm-demo";
// Local database only. Every row is tagged by a fresh UUID and removed in finally.
function sql(statement, onOutput = () => {}) {
  const child = spawn("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ]);
  let stdout = "";
  let stderr = "";
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      onOutput(stdout);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  child.stdin.end("\\set VERBOSITY verbose\n" + statement);
  return done;
}
async function succeeds(statement) {
  const result = await sql(statement);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}

for (const isolation of ["read committed", "repeatable read"]) {
  test(`concurrent partial packing cannot overpack at ${isolation}`, async () => {
    const order = randomUUID();
    const item = randomUUID();
    const firstPacking = randomUUID();
    const secondPacking = randomUUID();
    await succeeds(`
    insert into public.romiku_orders(id) values ('${order}');
    insert into public.romiku_order_items(id,order_id,sku,quantity) values ('${item}','${order}','RACE',100);
    insert into public.romiku_packing_lists(id,order_id) values ('${firstPacking}','${order}'),('${secondPacking}','${order}');
  `);
    try {
      let markReady;
      const ready = new Promise((resolve) => {
        markReady = resolve;
      });
      const first = sql(
        `
      begin;
      insert into public.romiku_packing_items(packing_list_id,order_id,source_order_item_id,sku,quantity)
      values ('${firstPacking}','${order}','${item}','RACE',70);
      select 'PACKING_LOCKED';
      select pg_sleep(0.8);
      commit;
    `,
        (output) => {
          if (output.includes("PACKING_LOCKED")) markReady();
        },
      );
      // Surface a failed first writer instead of waiting forever for its marker.
      await Promise.race([
        ready,
        first.then((result) => {
          assert.equal(result.code, 0, result.stderr);
        }),
      ]);
      const second = sql(`
      begin isolation level ${isolation};
      insert into public.romiku_packing_items(packing_list_id,order_id,source_order_item_id,sku,quantity)
      values ('${secondPacking}','${order}','${item}','RACE',70);
      commit;
    `);
      const [winner, loser] = await Promise.all([first, second]);
      assert.equal(winner.code, 0, winner.stderr);
      assert.notEqual(
        loser.code,
        0,
        "Both racing packing allocations committed",
      );
      assert.match(
        loser.stderr,
        /23514.*Packed quantity exceeds|40001.*Packing requires/,
      );
      assert.equal(
        await succeeds(
          `select packed_quantity || ':' || remaining_quantity from public.romiku_order_item_remaining where id='${item}'`,
        ),
        "70.0000:30.0000",
      );
      assert.equal(
        await succeeds(
          `select quantity from public.romiku_order_items where id='${item}'`,
        ),
        "100.0000",
      );
    } finally {
      await succeeds(`
      delete from public.romiku_packing_items where order_id='${order}';
      delete from public.romiku_packing_lists where order_id='${order}';
      delete from public.romiku_order_items where order_id='${order}';
      delete from public.romiku_orders where id='${order}';
    `);
    }
  });
}

test("parallel Quote creation assigns unique Shanghai daily numbers", async () => {
  const ids = Array.from({ length: 12 }, () => randomUUID());
  try {
    const numbers = await Promise.all(
      ids.map((id) =>
        succeeds(
          `insert into public.romiku_quotes(id) values ('${id}') returning document_number;`,
        ),
      ),
    );
    assert.equal(new Set(numbers).size, 12);
    for (const number of numbers) assert.match(number, /^RFQ\d{6}\d{3,}$/);
  } finally {
    await succeeds(
      `delete from public.romiku_quotes where id in (${ids.map((id) => "'" + id + "'").join(",")});`,
    );
  }
});
