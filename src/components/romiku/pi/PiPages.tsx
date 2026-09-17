import {
  DocumentCreate,
  DocumentDetail,
  DocumentList,
} from "../orders/DocumentPages";
export const PiList = () => <DocumentList kind="pi" />;
export const PiCreate = () => <DocumentCreate kind="pi" />;
export const PiDetail = () => <DocumentDetail kind="pi" />;
