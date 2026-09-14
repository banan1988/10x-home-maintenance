import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DYNAMIC_EXECUTE_PATTERN = /\bexecute\s+(?!function\b|procedure\b)/i;
const TEMPLATE_QUERY_PATTERN = /\.query\(\s*`[^`]*\$\{/;
const CONCAT_QUERY_PATTERN = /\.query\([^)]*\+[^)]*\)/;

function isScannableSourceFile(name) {
  return name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".integration.test.ts");
}

function listFiles(dir, matches) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listFiles(fullPath, matches));
    } else if (matches(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function scanFileLines(file, pattern) {
  const violations = [];
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      violations.push({ file, line: index + 1 });
    }
  });
  return violations;
}

export function scanMigrations(migrationsDir) {
  const violations = [];
  for (const file of listFiles(migrationsDir, (name) => name.endsWith(".sql"))) {
    violations.push(...scanFileLines(file, DYNAMIC_EXECUTE_PATTERN));
  }
  return violations;
}

export function scanSrc(srcDir) {
  const violations = [];
  for (const file of listFiles(srcDir, isScannableSourceFile)) {
    violations.push(...scanFileLines(file, TEMPLATE_QUERY_PATTERN), ...scanFileLines(file, CONCAT_QUERY_PATTERN));
  }
  return violations;
}

export function scanForRawSql({ migrationsDir, srcDir }) {
  return [...scanMigrations(migrationsDir), ...scanSrc(srcDir)];
}

function main() {
  const violations = scanForRawSql({ migrationsDir: "supabase/migrations", srcDir: "src" });

  if (violations.length > 0) {
    for (const { file, line } of violations) {
      console.error(`${file}:${line}`);
    }
    process.exit(1);
  }

  console.log("No raw/string-built SQL patterns found.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
