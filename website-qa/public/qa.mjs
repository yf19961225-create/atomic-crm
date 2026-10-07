/* global document: readonly */
import { createSubmission } from "./submission.mjs";
const form = document.querySelector("#inquiry"),
  products = document.querySelector("#products"),
  status = document.querySelector("#status"),
  submit = document.querySelector("#submit"),
  fieldset = document.querySelector("#draft"),
  newButton = document.querySelector("#new");
let flow;
try {
  flow = createSubmission(localStorage);
} catch {
  status.textContent =
    "Persistent browser storage is unavailable. Enable it before submitting so retries remain safe.";
  fieldset.disabled = true;
  submit.disabled = true;
}
if (flow) {
  const fields = [
    "name",
    "company",
    "brand",
    "email",
    "whatsapp",
    "market",
    "notes",
  ];
  function save() {
    flow.saveDraft({
      customer: Object.fromEntries(
        fields.map((name) => [name, form.elements.namedItem(name).value]),
      ),
      products: [...products.children].map((row) => ({
        sku: row.querySelector("[data-sku]").value,
        qty: row.querySelector("[data-qty]").value,
        notes: row.querySelector("[data-notes]").value,
      })),
    });
  }
  function row(item = {}) {
    const el = document.createElement("section");
    el.className = "product";
    for (const [key, label, type] of [
      ["sku", "SKU", "text"],
      ["qty", "Request Qty", "number"],
      ["notes", "Product requirement", "text"],
    ]) {
      const l = document.createElement("label");
      l.textContent = label;
      const input = document.createElement("input");
      input.type = type;
      input.dataset[key] = "";
      input.value = item[key] ?? "";
      if (key !== "notes") input.required = true;
      if (key === "qty") {
        input.min = "0.0001";
        input.step = "0.0001";
        input.max = "99999999999.9999";
      }
      l.append(input);
      el.append(l);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      el.remove();
      save();
    });
    el.append(remove);
    products.append(el);
  }
  function render() {
    const draft = flow.draft();
    for (const key of fields)
      form.elements.namedItem(key).value = draft.customer[key] || "";
    products.replaceChildren();
    for (const item of draft.products) row(item);
    if (!draft.products.length) row();
    fieldset.disabled = flow.pending();
    const receipt = flow.receipt();
    submit.disabled = Boolean(receipt?.success);
    submit.textContent = flow.pending()
      ? "Retry same submission"
      : "Submit QA inquiry";
    newButton.hidden = !receipt?.success;
    if (receipt)
      status.textContent =
        receipt.message ||
        `Inquiry ${receipt.document_number} saved. Retry pending notifications.`;
    else if (flow.pending())
      status.textContent =
        "A submission is pending. Retry sends the original saved data.";
  }
  form.addEventListener("input", save);
  document.querySelector("#add").addEventListener("click", () => {
    row();
    save();
  });
  document.querySelector("#import").addEventListener("click", () => {
    try {
      const cart = JSON.parse(localStorage.getItem("selectedProducts") || "[]");
      if (!Array.isArray(cart) || !cart.length) throw Error();
      products.replaceChildren();
      cart.forEach(row);
      save();
      status.textContent =
        "Website cart copied. The original cart is unchanged.";
    } catch {
      status.textContent =
        "No readable website cart on this origin. Add products by SKU.";
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!flow.pending()) save();
    submit.disabled = true;
    fieldset.disabled = true;
    status.textContent = "Saving inquiry to CRM Preview…";
    try {
      const result = await flow.submit(async (body) => {
        const response = await fetch("submit.php", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-ROMIKU-QA-CSRF":
              document.querySelector("[name=qa-csrf]").content,
          },
          body: JSON.stringify(body),
        });
        return response.json();
      });
      status.textContent = result.message;
    } catch {
      status.textContent =
        "Submission or notifications could not be confirmed. Your original data and submission ID are retained. Retry the same submission.";
    } finally {
      render();
      submit.disabled = Boolean(flow.receipt()?.success);
    }
  });
  newButton.addEventListener("click", () => {
    flow.startNew();
    status.textContent =
      "New QA inquiry. Previous captured notifications remain private.";
    render();
  });
  render();
}
