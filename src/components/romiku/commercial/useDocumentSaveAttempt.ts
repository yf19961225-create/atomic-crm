import { useRef, useState } from "react";

/** A local attempt gate, not a transaction or cross-tab lock. */
export function useDocumentSaveAttempt() {
  const locked = useRef(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  return {
    needsReconciliation,
    begin() {
      if (locked.current) return false;
      locked.current = true;
      return true;
    },
    succeed() {
      locked.current = false;
    },
    fail() {
      // REST errors cannot distinguish a rejected write from a lost response.
      // Keep this editor locked until it is reopened with fresh server data.
      setNeedsReconciliation(true);
    },
  };
}

export function documentSaveFailureMessage(detail: string) {
  return `保存未完成，服务器可能已保存部分或全部修改。请先保留当前草稿，再刷新页面核对已保存内容后继续；当前页面已暂停再次保存。错误：${detail}`;
}
