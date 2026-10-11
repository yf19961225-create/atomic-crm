import { userDisplayName } from "./userDisplayName";

it.each([
  [undefined, "未设置姓名"],
  [{ first_name: "Pending", last_name: "Pending" }, "未设置姓名"],
  [
    { display_name: " Pending Pending ", first_name: "杨锋", last_name: "" },
    "杨锋",
  ],
  [{ first_name: " 娜 ", last_name: "吴" }, "吴娜"],
  [{ first_name: "Jane", last_name: "Smith" }, "Jane Smith"],
  [
    { display_name: "用户自定义姓名", first_name: "Jane", last_name: "Smith" },
    "用户自定义姓名",
  ],
])("formats the shared profile name", (profile, expected) => {
  expect(userDisplayName(profile)).toBe(expected);
});
