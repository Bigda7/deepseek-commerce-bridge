import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import process from "node:process";
import console from "node:console";

const files = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
if (!files.length) throw new Error("No tracked public files to check.");
const findings = [];
const privatePaths =
  /^(?:delivery|output|tmp|docs\/(?:evidence|sources-private|reviews))\//;
const privateNames =
  /(?:victoria-questions|costs|recording|narration|submission|reviewer_guide|product_overview)/i;
const credential =
  /(?:sk-[A-Za-z0-9]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const userPath = /C:[\\/]Users[\\/][^\s"'<>]+/i;
for (const file of files) {
  if (privatePaths.test(file) || privateNames.test(file))
    findings.push({ file, reason: "private material path" });
  if (file.startsWith(".env") && file !== ".env.example")
    findings.push({ file, reason: "environment override" });
  if ([".ogg", ".wav", ".mp4", ".zip", ".pdf"].includes(extname(file)))
    findings.push({ file, reason: "local delivery or recording artifact" });
  if ([".png", ".jpg", ".jpeg"].includes(extname(file))) continue;
  const text = readFileSync(file, "utf8");
  if (credential.test(text))
    findings.push({ file, reason: "credential pattern" });
  if (userPath.test(text))
    findings.push({ file, reason: "personal local path" });
  if (file === ".env.example" && !/^DEEPSEEK_API_KEY=\s*$/m.test(text))
    findings.push({ file, reason: "nonempty example key" });
}
if (findings.length) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", trackedFiles: files.length }));
}
