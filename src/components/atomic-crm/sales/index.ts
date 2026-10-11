import { userDisplayName } from "@/lib/userDisplayName";
import type { Sale } from "../types";
import { SalesCreate } from "./SalesCreate";
import { SalesEdit } from "./SalesEdit";
import { SalesList } from "./SalesList";

export default {
  list: SalesList,
  create: SalesCreate,
  edit: SalesEdit,
  recordRepresentation: (record: Sale) => userDisplayName(record),
};
