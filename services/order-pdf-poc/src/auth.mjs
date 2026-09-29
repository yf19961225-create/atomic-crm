import { timingSafeEqual } from "node:crypto";

export function isAuthorized(header, expectedToken) {
  const expected = Buffer.from("Bearer " + expectedToken);
  const received = Buffer.from(header || "");
  return (
    received.byteLength === expected.byteLength &&
    timingSafeEqual(received, expected)
  );
}
