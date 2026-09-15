import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  Factory,
  FileText,
  Handshake,
  PackageCheck,
  ReceiptText,
  Send,
  Settings,
  ShipWheel,
  UsersRound,
  Workflow,
} from "lucide-react";

export type RomikuNavigationItem = {
  icon: LucideIcon;
  label: string;
  path: string;
};

export const romikuNavigation: RomikuNavigationItem[] = [
  { icon: Workflow, label: "Workbench", path: "/" },
  {
    icon: ClipboardList,
    label: "Website Inquiries",
    path: "/website-inquiries",
  },
  {
    icon: Send,
    label: "Outbound Development",
    path: "/outbound-development",
  },
  { icon: UsersRound, label: "Formal Customers", path: "/formal-customers" },
  { icon: FileText, label: "Quotes", path: "/quotes" },
  { icon: ReceiptText, label: "PI", path: "/pi" },
  { icon: Handshake, label: "Orders", path: "/orders" },
  { icon: Factory, label: "Production", path: "/production" },
  {
    icon: ShipWheel,
    label: "Packing & Shipping",
    path: "/packing-shipping",
  },
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
  { icon: PackageCheck, label: "Suppliers", path: "/suppliers" },
  { icon: Boxes, label: "Product Library", path: "/product-library" },
  { icon: Settings, label: "Settings", path: "/settings" },
];
