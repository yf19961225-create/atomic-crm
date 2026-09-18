import { required } from "ra-core";
import { BooleanInput } from "@/components/admin/boolean-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

export const SupplierContactInputs = () => (
  <div className="grid max-w-3xl gap-4 md:grid-cols-2">
    <ReferenceInput source="supplier_id" reference="romiku_suppliers">
      <SelectInput
        optionText="name"
        label="供应商"
        validate={required()}
        helperText={false}
      />
    </ReferenceInput>
    <TextInput
      source="name"
      label="姓名"
      validate={required()}
      helperText={false}
    />
    <TextInput source="title" label="职位" helperText={false} />
    <TextInput source="department" label="部门" helperText={false} />
    <TextInput source="role" label="职责" helperText={false} />
    <TextInput source="email" label="邮箱" type="email" helperText={false} />
    <TextInput source="phone" label="电话" helperText={false} />
    <TextInput source="whatsapp" label="WhatsApp" helperText={false} />
    <TextInput source="wechat" label="微信" helperText={false} />
    <div className="flex gap-6">
      <BooleanInput source="is_primary" label="主要联系人" helperText={false} />
      <BooleanInput
        source="is_active"
        label="启用"
        helperText={false}
        defaultValue
      />
    </div>
    <TextInput source="notes" label="备注" multiline helperText={false} />
  </div>
);
