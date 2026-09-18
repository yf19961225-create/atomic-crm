import { required } from "ra-core";
import { ArrayInput } from "@/components/admin/array-input";
import { NumberInput } from "@/components/admin/number-input";
import { SelectInput } from "@/components/admin/select-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { TextInput } from "@/components/admin/text-input";
import { supplierStatusChoices } from "../commercialLabels";

export const SupplierInputs = () => (
  <div className="grid max-w-3xl gap-4 md:grid-cols-2">
    <TextInput
      source="name"
      label="供应商名称"
      validate={required()}
      helperText={false}
    />
    <SelectInput
      source="status"
      label="状态"
      choices={supplierStatusChoices}
      helperText={false}
    />
    <SelectInput
      source="grade"
      label="等级"
      choices={["A", "B", "C"]}
      helperText={false}
    />
    <NumberInput
      source="default_lead_days"
      label="默认交期（天）"
      min={0}
      helperText={false}
    />
    <TextInput source="region" label="地区" helperText={false} />
    <ArrayInput source="categories" label="品类" helperText={false}>
      <SimpleFormIterator disableReordering fullWidth getItemLabel={false}>
        <TextInput source="" label="品类" helperText={false} />
      </SimpleFormIterator>
    </ArrayInput>
    <TextInput source="address" label="地址" multiline helperText={false} />
    <TextInput
      source="shipping_address"
      label="发货地址"
      multiline
      helperText={false}
    />
    <TextInput source="notes" label="备注" multiline helperText={false} />
  </div>
);
