import { CRM } from "@/components/atomic-crm/root/CRM";
import { RomikuLayout } from "@/components/romiku/layout/RomikuLayout";
import { romikuRoutes } from "@/components/romiku/routes/RomikuRoutes";
import { RomikuWorkbench } from "@/components/romiku/workbench/RomikuWorkbench";
import { romikuResources } from "@/components/romiku/resources";
import { romikuBrand } from "@/components/romiku/branding/brand";
import { romikuI18nProvider } from "@/components/romiku/branding/i18nProvider";

/**
 * Application entry point
 *
 * Customize Atomic CRM by passing props to the CRM component:
 *  - companySectors
 *  - darkTheme
 *  - dealCategories
 *  - dealPipelineStatuses
 *  - dealStages
 *  - lightTheme
 *  - darkModeLogo / lightModeLogo
 *  - noteStatuses
 *  - taskTypes
 *  - title
 * ... as well as all the props accepted by shadcn-admin-kit's <Admin> component.
 *
 * Logos must be an imported asset, an absolute URL, or a data URI — never a
 * route-relative path like "./img/logo.png", which breaks on nested routes.
 *
 * @example
 * import logoDark from "./logo-dark.svg";
 * import logoLight from "./logo-light.svg";
 *
 * const App = () => (
 *    <CRM
 *       darkModeLogo={logoDark}
 *       lightModeLogo={logoLight}
 *       title="Acme CRM"
 *    />
 * );
 */
const App = () => (
  <CRM
    additionalRoutes={romikuRoutes}
    additionalResources={romikuResources}
    dashboard={RomikuWorkbench}
    darkModeLogo={romikuBrand.darkModeLogo}
    i18nProvider={romikuI18nProvider}
    layout={RomikuLayout}
    lightModeLogo={romikuBrand.lightModeLogo}
    title={romikuBrand.title}
  />
);

export default App;
