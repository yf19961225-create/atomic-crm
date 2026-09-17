import { Route } from "react-router";
import { ProductLibrary } from "../products";
import { SupplierContactList, SupplierList } from "../suppliers";
import { romikuNavigation } from "./navigation";
import { InquiryPage } from "../inquiries/InquiryPage";
import { OutboundPage } from "../outbound/OutboundPage";
import { CustomerPage } from "../customers/CustomerPage";
import { QuoteList, QuoteDetail } from "../quotes/QuotePages";
import { QuoteCreate } from "../quotes/QuoteCreate";

const RomikuPlaceholder = ({ label }: { label: string }) => (
  <section
    aria-labelledby="placeholder-heading"
    className="max-w-3xl space-y-2"
  >
    <h1
      id="placeholder-heading"
      className="text-3xl font-semibold tracking-tight"
    >
      {label}
    </h1>
    <p className="text-muted-foreground">
      This ROMIKU workspace is coming next. No records or actions are available
      yet.
    </p>
  </section>
);

const placeholderRoutes = romikuNavigation
  .filter(
    (item) =>
      item.path !== "/" &&
      item.path !== "/suppliers" &&
      item.path !== "/website-inquiries" &&
      item.path !== "/outbound-development" &&
      item.path !== "/formal-customers" &&
      item.path !== "/quotes" &&
      item.path !== "/product-library",
  )
  .map((item) => (
    <Route
      key={item.path}
      path={item.path}
      element={<RomikuPlaceholder label={item.label} />}
    />
  ));

export const romikuRoutes = [
  ...placeholderRoutes,
  <Route key="/quotes" path="/quotes" element={<QuoteList />} />,
  <Route key="/quotes/new" path="/quotes/new" element={<QuoteCreate />} />,
  <Route key="/quotes/:id" path="/quotes/:id" element={<QuoteDetail />} />,
  <Route
    key="/website-inquiries"
    path="/website-inquiries"
    element={<InquiryPage />}
  />,
  <Route
    key="/outbound-development"
    path="/outbound-development"
    element={<OutboundPage />}
  />,
  <Route
    key="/formal-customers"
    path="/formal-customers"
    element={<CustomerPage />}
  />,
  <Route key="/suppliers" path="/suppliers" element={<SupplierList />} />,
  <Route
    key="/supplier-contacts"
    path="/supplier-contacts"
    element={<SupplierContactList />}
  />,
  <Route
    key="/product-library"
    path="/product-library"
    element={<ProductLibrary />}
  />,
];
