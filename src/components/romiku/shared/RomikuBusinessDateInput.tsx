import {
  useInput,
  FieldTitle,
  useResourceContext,
  type InputProps,
} from "ra-core";
import {
  FormControl,
  FormError,
  FormField,
  FormLabel,
} from "@/components/admin/form";
import { InputHelperText } from "@/components/admin/input-helper-text";
import { RomikuDatePicker } from "./RomikuDatePicker";
/** Scoped RA adapter: generic admin DateInput semantics remain untouched. */
export function RomikuBusinessDateInput(props: InputProps) {
  const { field, id, isRequired } = useInput(props);
  const resource = useResourceContext(props);
  return (
    <FormField id={id} name={field.name}>
      {props.label !== false && (
        <FormLabel>
          <FieldTitle
            label={props.label}
            source={props.source}
            resource={resource}
            isRequired={isRequired}
          />
        </FormLabel>
      )}
      <FormControl>
        <RomikuDatePicker
          id={id}
          name={field.name}
          label={typeof props.label === "string" ? props.label : props.source}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          inputRef={field.ref}
          required={isRequired}
          disabled={props.disabled}
          readOnly={props.readOnly}
        />
      </FormControl>
      <InputHelperText helperText={props.helperText} />
      <FormError />
    </FormField>
  );
}
