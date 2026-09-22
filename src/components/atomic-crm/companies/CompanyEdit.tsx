import { EditBase, Form } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { CompanyInputs } from "./CompanyInputs";
import { CompanyAside } from "./CompanyAside";
import { FormToolbar } from "../layout/FormToolbar";
import { normalizeUrl } from "@/components/romiku/shared/urlNormalization";

export const CompanyEdit = () => (
  <EditBase
    actions={false}
    redirect="show"
    transform={(values) => {
      return { ...values, website: normalizeUrl(values.website) };
    }}
  >
    <div className="mt-2 flex gap-8">
      <Form className="flex flex-1 flex-col gap-4 pb-2">
        <Card>
          <CardContent>
            <CompanyInputs />
            <FormToolbar />
          </CardContent>
        </Card>
      </Form>

      <CompanyAside link="show" />
    </div>
  </EditBase>
);
