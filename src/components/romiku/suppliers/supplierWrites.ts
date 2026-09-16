export type SupplierContactWrite = {
  supplier_id: string;
  name: string;
  title?: string | null;
  department?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  wechat?: string | null;
  is_primary?: boolean;
  is_active?: boolean;
  notes?: string | null;
};

export const toSupplierContactWrite = (
  values: SupplierContactWrite,
): SupplierContactWrite => ({
  supplier_id: values.supplier_id,
  name: values.name.trim(),
  title: values.title || null,
  department: values.department || null,
  role: values.role || null,
  email: values.email || null,
  phone: values.phone || null,
  whatsapp: values.whatsapp || null,
  wechat: values.wechat || null,
  is_primary: values.is_primary ?? false,
  is_active: values.is_active ?? true,
  notes: values.notes || null,
});
