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
  { icon: Workflow, label: "工作台", path: "/" },
  {
    icon: ClipboardList,
    label: "网站询盘",
    path: "/website-inquiries",
  },
  {
    icon: Send,
    label: "外贸开发",
    path: "/outbound-development",
  },
  { icon: UsersRound, label: "正式客户", path: "/formal-customers" },
  { icon: FileText, label: "报价单", path: "/quotes" },
  { icon: ReceiptText, label: "PI", path: "/pi" },
  { icon: Handshake, label: "订单", path: "/orders" },
  { icon: Factory, label: "生产", path: "/production" },
  {
    icon: ShipWheel,
    label: "装箱与发货",
    path: "/packing-shipping",
  },
  { icon: CalendarDays, label: "日历", path: "/calendar" },
  { icon: PackageCheck, label: "供应商", path: "/suppliers" },
  { icon: Boxes, label: "产品库", path: "/product-library" },
  { icon: Settings, label: "设置", path: "/settings" },
];
