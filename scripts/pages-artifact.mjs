import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "dist", "client");
const shellPath = existsSync(join(dir, "index.html"))
  ? join(dir, "index.html")
  : existsSync(join(dir, "_shell.html"))
    ? join(dir, "_shell.html")
    : "";
if (!existsSync(shellPath)) {
  console.error("pages artifact missing shell html in", dir);
  process.exit(1);
}
const shell = Buffer.from(readFileSync(shellPath).filter((byte) => byte !== 0));
writeFileSync(join(dir, "index.html"), shell);
writeFileSync(join(dir, "404.html"), shell);
writeFileSync(join(dir, ".nojekyll"), "");
console.log("pages artifact ready", dir);
