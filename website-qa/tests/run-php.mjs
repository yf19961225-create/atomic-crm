import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
for (const name of [
  "validation.php",
  "pipeline.php",
  "runtime.php",
  "mail.php",
  "smtp-reuse.php",
  "concurrency.php",
  "http.php",
]) {
  const docker = process.env.ROMIKU_TEST_PHP === "docker";
  const command = docker ? "docker" : process.env.PHP_BIN || "php";
  const args = docker
    ? [
        "run",
        "--rm",
        "--pull",
        "never",
        "--network",
        "none",
        "-v",
        `${root}/..:/project:ro`,
        "php:8.3-cli",
        "php",
        `/project/website-qa/tests/${name}`,
      ]
    : [`${root}/tests/${name}`];
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(
      "PHP 8.1+ is required, or pull php:8.3-cli then run ROMIKU_TEST_PHP=docker npm test.",
    );
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
