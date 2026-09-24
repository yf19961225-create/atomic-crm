import { expect, it } from "vitest";
import { readServerImageDimensions } from "../../api/order-export-image";

it("reads JPEG natural pixels before returning an Order export image", () => {
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x60, 0x01, 0x20, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);

  expect(readServerImageDimensions(bytes.buffer)).toEqual({
    width: 288,
    height: 96,
  });
});
