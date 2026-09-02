import fs from "node:fs";
import Database from "better-sqlite3";

const sourcePath = process.argv[2] ?? "dev.db";
const targetPath = process.argv[3] ?? "local-test.db";

if (!fs.existsSync(sourcePath)) {
  console.error(`Source database not found: ${sourcePath}`);
  process.exit(1);
}

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  fs.rmSync(`${targetPath}${suffix}`, { force: true });
}

const source = new Database(sourcePath, { readonly: true });
try {
  await source.backup(targetPath);
  console.log(`Created isolated test database: ${targetPath}`);
} finally {
  source.close();
}
