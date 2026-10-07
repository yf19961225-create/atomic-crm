const KEY = "romiku.website.qa.submission.v1";
export function createSubmission(storage, uuid = () => crypto.randomUUID()) {
  const read = () =>
    JSON.parse(storage.getItem(KEY) || "null") || {
      id: uuid(),
      draft: { customer: {}, products: [] },
    };
  let state = read();
  const write = () => storage.setItem(KEY, JSON.stringify(state));
  write();
  return {
    id: () => state.id,
    draft: () => structuredClone(state.draft),
    receipt: () => state.receipt,
    pending: () => Boolean(state.frozen),
    saveDraft(draft) {
      if (!state.frozen) {
        state.draft = structuredClone(draft);
        write();
      }
    },
    async submit(request) {
      state.frozen ||= {
        ...structuredClone(state.draft),
        submissionId: state.id,
      };
      write();
      const result = await request(state.frozen);
      if (result.code === "VALIDATION_ERROR" && result.crmSaved === false) {
        delete state.frozen;
        write();
      }
      if (result.crmSaved) {
        state.receipt = result;
        write();
      }
      if (!result.success || !result.crmSaved)
        throw Error(
          result.message ||
            "Submission was not completed. Your inquiry is saved here; retry with the same submission.",
        );
      return result;
    },
    startNew() {
      state = { id: uuid(), draft: { customer: {}, products: [] } };
      write();
    },
  };
}
