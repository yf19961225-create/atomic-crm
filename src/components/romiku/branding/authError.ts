export const authErrorMessage = (error: unknown, fallback: string) => {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
  if (/invalid login credentials|invalid.*password/i.test(message))
    return "邮箱或密码不正确。";
  if (/email.*not.*confirm/i.test(message)) return "请先通过邮箱确认账户。";
  if (/rate limit|too many/i.test(message)) return "操作过于频繁，请稍后再试。";
  if (/already registered/i.test(message)) return "该邮箱已注册。";
  return fallback;
};
