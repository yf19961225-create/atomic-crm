export function assertLocalSmokeTarget(appUrl: string, apiUrl: string) {
  if (
    appUrl !== "http://127.0.0.1:5176" ||
    apiUrl !== "http://127.0.0.1:54321"
  ) {
    throw new Error("Release smoke only permits its fixed local app and API");
  }
}
