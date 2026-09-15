import { Route } from "react-router";
import { romikuNavigation } from "./navigation";

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

export const romikuRoutes = romikuNavigation
  .filter((item) => item.path !== "/")
  .map((item) => (
    <Route
      key={item.path}
      path={item.path}
      element={<RomikuPlaceholder label={item.label} />}
    />
  ));
