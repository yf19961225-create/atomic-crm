import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
const source = process.env.ROMIKU_LIVE_APP_SOURCE;
const output = join(tmpdir(), `romiku-app-test-${process.pid}.js`);
test(
  "audited live patch preserves decimal quantity, recovery and contact flow",
  { skip: !source },
  () => {
    execFileSync("python3", [
      "website-production/prepare-app.py",
      source,
      output,
    ]);
    const app = readFileSync(output, "utf8");
    const fn = app.slice(
      app.indexOf("function normalizedQuantity("),
      app.indexOf("function setQuantityInputValue("),
    );
    const c = vm.createContext({});
    vm.runInContext(fn, c);
    assert.equal(c.normalizedQuantity(120.125, 12), 120.125);
    assert.equal(c.normalizedQuantity(0.25, 12), 0.25);
    assert.ok(app.includes("restorePendingInquiry"));
    assert.ok(app.includes("readPendingInquiry"));
    assert.ok(app.includes("result.crmSaved"));
    assert.ok(app.includes("openWhatsApp(buildContactWhatsAppMessage(data))"));
    assert.ok(
      !app.includes("openWhatsApp(buildInquiryWhatsAppMessage(data));"),
    );
    assert.ok(app.includes("product.notes = note.value"));
  },
);

test(
  "cart hydration preserves fractional quantities and item notes; confirmed older draft does not clear edits",
  { skip: !source },
  () => {
    execFileSync("python3", [
      "website-production/prepare-app.py",
      source,
      output + ".hydration",
    ]);
    const app = readFileSync(output + ".hydration", "utf8");
    const start = app.indexOf("function normalizeProduct(");
    const fn = app.slice(
      start,
      app.indexOf("\nselectedProducts.splice", start),
    );
    const c = vm.createContext({
      translate: (x) => x,
      localizedQuantityUnit: (x) => x,
      parseMOQUnit: () => "",
    });
    vm.runInContext(fn, c);
    const p = c.normalizeProduct({
      sku: "005",
      name: "QA",
      qty: 0.25,
      notes: "retain me",
      unit: "PCS",
    });
    assert.equal(p.qty, 0.25);
    assert.equal(p.notes, "retain me");
    assert.ok(app.includes("result.draftPreserved || !sameInquiryDraft("));
  },
);
