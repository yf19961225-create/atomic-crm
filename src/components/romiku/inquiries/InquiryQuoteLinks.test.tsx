import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { InquiryQuoteLinks, QuoteInquirySource } from "./InquiryQuoteLinks";
import { RequestedQuantity } from "../quotes/RequestedQuantity";

it("shows saved WI/RFQ business numbers in both provenance directions", async () => {
  const provider = fakeRestDataProvider({
    romiku_website_inquiries: [{ id: "i1", document_number: "WI-0123" }],
    romiku_quotes: [
      {
        id: "q1",
        document_number: "RFQ001",
        source_website_inquiry_id: "i1",
        created_at: "2026-10-06",
      },
      {
        id: "q2",
        document_number: "RFQ002",
        source_website_inquiry_id: "i1",
        created_at: "2026-10-07",
      },
      { id: "q3", document_number: "OTHER", source_website_inquiry_id: "i2" },
    ],
  });
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <QuoteInquirySource inquiryId="i1" />
        <InquiryQuoteLinks inquiryId="i1" />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("link", { name: "来源网站询盘：WI-0123" }))
    .toHaveAttribute("href", "/website-inquiries?record=i1");
  await expect
    .element(screen.getByRole("link", { name: "RFQ001", exact: true }))
    .toHaveAttribute("href", "/quotes/q1");
  await expect
    .element(screen.getByRole("link", { name: "RFQ002", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "OTHER", exact: true }))
    .not.toBeInTheDocument();
});
it("only shows read-only requested quantity for explicit website-source quote", async () => {
  const screen = await render(
    <div>
      <RequestedQuantity websiteSource value={120} />
      <RequestedQuantity websiteSource value={null} />
      <RequestedQuantity websiteSource={false} value={999} />
    </div>,
  );
  await expect
    .element(screen.getByText("询价数量：120", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("询价数量：—", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("询价数量：999", { exact: true }))
    .not.toBeInTheDocument();
  expect(document.querySelectorAll("input").length).toBe(0);
});
