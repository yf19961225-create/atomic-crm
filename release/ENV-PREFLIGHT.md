# 后续环境验证（当前未读取或修改 secret）

单独授权后，只针对 Vercel romiku-crm-prod 的 Production deployment 和 project vddjodsbmuarshnytyvb：

1. 在内存中读取 Production scope；禁止 env pull 到仓库、stdout、日志、命令参数、截图。
2. 精确断言 SUPABASE_URL = https://vddjodsbmuarshnytyvb.supabase.co；VERCEL_ENV=production。VITE_SUPABASE_URL 同项目。Preview 分支 override 不影响 Production；不得复制 Preview 变量。
3. legacy JWT key 只在内存解析 role/ref，分别应为 service_role / anon 且 ref 正确；解析不是完整验证。opaque publishable/secret key 无法靠字符串判断项目，须以目标项目管理配置或实际认证结果证明。
4. 对确认目标的只读 REST 请求认证：service key 验证正常访问预期 romiku schema；publishable key 验证匿名范围正常。禁止将 key 发到其他目标，禁止将 key 放在 URL。只输出匹配/不匹配与状态码。
5. WEBSITE_INQUIRY_SECRET 两端在可信终端 hidden input / 私有配置读取后 constant-time compare；只输出相等/不等，不输出值或可持久关联的 hash。保持正式 secret 不变，除非单独授权 rotation。
6. Edge Functions 共用 supabaseAdmin guard 需显式 ROMIKU_DEPLOYMENT_ENV=production；Preview 为 preview，本地为 development。未配置会拒绝启动，此项是发布阻断检查。VERCEL_ENV 与 ROMIKU_DEPLOYMENT_ENV 同时存在时必须一致。
7. build-time 前端 env 必须在 build 前正确；修改 server env 后也需新 deployment。检查实际部署 JS 的公开 Supabase URL 与 ref，仅查看公开键类型和认证结果，不输出原值。
8. /api/website-inquiries 与 /api/website-inquiry-xlsx 错误 target 必须503且没有数据库请求；无 shared secret 为401。正式写入验收必须等切换授权。

失败即停止 rollout；不自动修正变量、不回退到另一数据库、不写旧 CRM。
