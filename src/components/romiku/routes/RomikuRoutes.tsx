import { Route } from "react-router";
import { RomikuCalendar } from "../calendar/RomikuCalendar";
import { ManualTaskList, ManualTaskPage } from "../calendar/ManualTasks";
import { ProductLibrary } from "../products";
import {
  SupplierContactList,
  SupplierCreate,
  SupplierList,
} from "../suppliers";
import { romikuNavigation } from "./navigation";
import { InquiryPage } from "../inquiries/InquiryPage";
import { OutboundPage } from "../outbound/OutboundPage";
import { CustomerPage } from "../customers/CustomerPage";
import { QuoteList, QuoteDetail } from "../quotes/QuotePages";
import { QuoteCreate } from "../quotes/QuoteCreate";
import { PiList, PiCreate, PiDetail } from "../pi/PiPages";
import {
  FulfillmentList,
  FulfillmentDetail,
} from "../production/FulfillmentPages";
import { ProductionCreate } from "../production/ProductionCreate";
import { PackingCreate } from "../packing/PackingCreate";
import {
  DocumentCreate,
  DocumentDetail,
  DocumentList,
} from "../orders/DocumentPages";

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
      此 ROMIKU 工作区即将推出，暂时没有可用记录或操作。
    </p>
  </section>
);

const placeholderRoutes = romikuNavigation
  .filter(
    (item) =>
      item.path !== "/" &&
      item.path !== "/calendar" &&
      item.path !== "/suppliers" &&
      item.path !== "/website-inquiries" &&
      item.path !== "/outbound-development" &&
      item.path !== "/formal-customers" &&
      item.path !== "/quotes" &&
      item.path !== "/pi" &&
      item.path !== "/orders" &&
      item.path !== "/production" &&
      item.path !== "/packing-shipping" &&
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
  <Route key="/calendar" path="/calendar" element={<RomikuCalendar />} />,
  <Route
    key="/calendar/tasks"
    path="/calendar/tasks"
    element={<ManualTaskList />}
  />,
  <Route
    key="/calendar/tasks/:id"
    path="/calendar/tasks/:id"
    element={<ManualTaskPage />}
  />,
  <Route
    key="/production"
    path="/production"
    element={<FulfillmentList kind="production" />}
  />,
  <Route
    key="/production/new"
    path="/production/new"
    element={<ProductionCreate />}
  />,
  <Route
    key="/production/:id"
    path="/production/:id"
    element={<FulfillmentDetail kind="production" />}
  />,
  <Route
    key="/packing-shipping"
    path="/packing-shipping"
    element={<FulfillmentList kind="packing" />}
  />,
  <Route
    key="/packing-shipping/new"
    path="/packing-shipping/new"
    element={<PackingCreate />}
  />,
  <Route
    key="/packing-shipping/:id"
    path="/packing-shipping/:id"
    element={<FulfillmentDetail kind="packing" />}
  />,
  <Route key="/pi" path="/pi" element={<PiList />} />,
  <Route key="/pi/new" path="/pi/new" element={<PiCreate />} />,
  <Route key="/pi/:id" path="/pi/:id" element={<PiDetail />} />,
  <Route
    key="/orders"
    path="/orders"
    element={<DocumentList kind="order" />}
  />,
  <Route
    key="/orders/new"
    path="/orders/new"
    element={<DocumentCreate kind="order" />}
  />,
  <Route
    key="/orders/:id"
    path="/orders/:id"
    element={<DocumentDetail kind="order" />}
  />,
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
    key="/romiku_suppliers/create"
    path="/romiku_suppliers/create"
    element={<SupplierCreate />}
  />,
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
