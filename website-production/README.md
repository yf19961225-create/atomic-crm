# Namecheap Production cutover candidate — NOT INSTALLED

只准备，不安装、不启用、不发送邮件。线上正式入口与 SMTP 未变。独立 QA endpoint 继续 capture。

## 运行边界

- `website-runtime/lib`：共享 normalization、CRM receipt/snapshot、每通知独立 ledger、MIME。沿用 qa_ 函数名以免改变已验收语义，不包含 Preview target/Gmail allowlist/15分钟窗口/capture 控制。
- `website-production`：仅 crm2.romiku.com 两个 API；owner 为现有内部地址、customer 为 CRM saved snapshot email；现有 SMTP transport 的函数副本 + 原私有配置引用。密码不复制。
- `website-qa`：固定 Preview、Gmail allowlist、批准 submissionId、限时发送/capture，绝不打包进正式 runtime。

## 准备包与目录

运行 `python3 release/build-package.py /private/tmp/romiku-production-rc.zip`。ZIP 只含 allowlist 的 runtime、示例配置、前端补丁和部署说明；不包含 QA、SMTP secret、现网 transport 提取物、测试邮件或业务数据。

未来授权安装到 `/home/romilnrk/romiku-private/website-intake/releases/<RC_SHA>/`，内含同级 website-runtime 与 website-production。目录0700、PHP/config/ledger0600；`current` 指向 release，state 在 release 外持久化。

配置由 `config.example.php` 提供结构，默认 enabled=false。核对 catalog 的实际静态路径及 ROMIKU_OWNER_EMAIL；shared-secret.php 单独 hidden-input 写入，与 Production Vercel 一致，不打包、不打印。任何未核对项禁止 enable。

在覆盖正式 handler 前，从备份原 handler 提取现有 SMTP 函数：

```sh
php website-production/extract-smtp.php /private/backup/submit-rfq.php website-production/existing-smtp-functions.php
php -l website-production/existing-smtp-functions.php
```

仅 token 解析指定函数，不执行原 handler；人工确认提取函数没有内联 credential，再装入私有 release。mailer 继续 require 正式 config.php；先完成 SMTP Web Root 外迁移。

## 前端 patch

`app-source.sha256` 对应 2026-10-07 只读抓取正式 app.js。先备份现网 app.js、handler、相关 HTML/cache配置；本地运行：

```sh
python3 website-production/prepare-app.py /private/backup/app.js /private/staging/app.js
```

源文件不匹配则停止，不强行 patch。把 public/submission.mjs 安装为 Web Root `romiku-inquiry-submission.mjs`（公开脚本不含 secret）。未来与 patched app.js、薄 wrapper public/submit-rfq.php 一起原子切换，更新既有 app.js cache version；核对 CDN 不再提供旧提交脚本。已有 form/cart 保留。brand 字段存在则读取；没有则保存空，不虚构值。

客户端持久化一次 submissionId+payload，失败保留；明确验证失败可修改；只有 CRM 保存且两封邮件均成功后清除。服务器按 saved receipt 生成邮件/附件；customer 无内部附件。CRM失败不发邮件，不调用旧 CRM。HTTP并发由每UUID flock串行化。

## 邮件可靠性

每通知有独立 accepted ledger。internal成功/customer失败只重试customer。SMTP调用前记attempting，成功记accepted；调用异常/进程中断留attempting，停止自动重试，需核对SMTP/provider日志后人工恢复。SMTP不能保证网络断开时端到端exactly-once；不把未知状态当失败自动重发。

## 必须完成的部署现场核验（不是当前已通过项）

Production恢复只读核验、env/key同项目、现网 source hash、静态catalog路径、现有SMTP函数提取、owner、private permissions、cURL/PHP版本、CDN缓存切换、production HTTPS/session/origin，以及一条授权真实Inquiry。当前包尚未在正式环境运行；禁止据本地测试直接上线。

七类 XLSX 继续使用 CRM 已验收 renderer/template；本包只请求 saved Inquiry 附件，不重写Excel。
