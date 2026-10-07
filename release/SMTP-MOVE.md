# SMTP 私有迁移操作卡（仅准备，未执行）

单独获得 Production 操作授权后，在 Namecheap 用户 romilnrk 的终端逐段执行。不要粘贴密码、不要打开 shell tracing。不上传包含凭据的备份/ZIP。现有 transport 为 smtppro.zoho.com:465 SSL；保留 config.php 中 username/From/name/Reply-To。

## 备份与私有副本

```sh
set -eu
umask 077
backup_dir="/home/romilnrk/romiku-private/backups/smtp-$(date +%Y%m%d%H%M%S)"
mkdir -p "$backup_dir" /home/romilnrk/romiku-private/smtp
chmod 700 /home/romilnrk/romiku-private "$backup_dir" /home/romilnrk/romiku-private/backups /home/romilnrk/romiku-private/smtp
cp -p /home/romilnrk/public_html/api/config.php "$backup_dir/config.php"
cp -p /home/romilnrk/public_html/api/smtp-secret.php "$backup_dir/smtp-secret.php"
cp -p /home/romilnrk/public_html/api/submit-rfq.php "$backup_dir/submit-rfq.php"
chmod 600 "$backup_dir/"*.php
install -m 600 /home/romilnrk/public_html/api/smtp-secret.php /home/romilnrk/romiku-private/smtp/smtp-secret.php
cmp -s /home/romilnrk/public_html/api/smtp-secret.php /home/romilnrk/romiku-private/smtp/smtp-secret.php
php -l /home/romilnrk/romiku-private/smtp/smtp-secret.php
```

## Loader patch

先核对 config.php 中唯一的同目录 smtp-secret.php include/require 表达式（只看路径行，勿输出配置值）。仅将该表达式的路径改为：

```php
'/home/romilnrk/romiku-private/smtp/smtp-secret.php'
```

保留原 include/require 类型、ROMIKU_API_BOOTSTRAPPED guard 和所有常量。审计表达式为 `$romikuSmtpSecretPath = __DIR__ . '/smtp-secret.php';`。使用离线生成器写 `config.php.next`：

```sh
python3 release/prepare-smtp-loader.py /home/romilnrk/public_html/api/config.php /home/romilnrk/public_html/api/config.php.next
```

`php -l` 通过后在同一目录原子 rename 覆盖。遇到与审计不一致的 loader，停止重新生成 patch，禁止全文件正则替换。

```sh
php -l /home/romilnrk/public_html/api/config.php.next
mv /home/romilnrk/public_html/api/config.php.next /home/romilnrk/public_html/api/config.php
php -r "define('ROMIKU_API_BOOTSTRAPPED', true); require '/home/romilnrk/public_html/api/config.php'; echo 'loader OK', PHP_EOL;"
```

先做不发送邮件的 transport 配置断言（仅输出 PASS/FAIL：host/port/encryption/identity 与备份一致，password 非空），再经授权只发一封内部测试邮件。成功后才删除 Web Root 内旧副本：

```sh
rm /home/romilnrk/public_html/api/smtp-secret.php
```

此命令当前未执行。不要通过公开 URL 请求 PHP secret 文件来验证，以免配置错误暴露源码。

## 回滚

secret 已移出后，优先保持私有 loader。若必须完整恢复迁移前 loader，先恢复旧 secret，再原子恢复 config（不得先恢复 loader 造成中断）：

```sh
install -m 600 "$backup_dir/smtp-secret.php" /home/romilnrk/public_html/api/smtp-secret.php
cp "$backup_dir/config.php" /home/romilnrk/public_html/api/config.php.next
php -l /home/romilnrk/public_html/api/config.php.next
mv /home/romilnrk/public_html/api/config.php.next /home/romilnrk/public_html/api/config.php
```

备份目录只在服务器私有区域保留，0700/0600，不进入 Git 或发布包。
