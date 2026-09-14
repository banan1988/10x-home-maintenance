import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { scanForRawSql, scanMigrations, scanSrc } from "./check-no-raw-sql.mjs";

let tempDir;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("scanMigrations", () => {
  it("should flag a dynamic EXECUTE statement in a migration file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raw-sql-migrations-"));
    writeFileSync(join(tempDir, "fixture.sql"), "execute format('select %I from %I', col, tbl);\n");

    const violations = scanMigrations(tempDir);

    expect(violations).toEqual([{ file: join(tempDir, "fixture.sql"), line: 1 }]);
  });

  it("should not flag EXECUTE FUNCTION trigger-invocation syntax", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raw-sql-migrations-"));
    writeFileSync(join(tempDir, "fixture.sql"), "execute function set_updated_at();\n");

    const violations = scanMigrations(tempDir);

    expect(violations).toEqual([]);
  });
});

describe("scanSrc", () => {
  it("should flag a .query() call built with a template-literal interpolation", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raw-sql-src-"));
    writeFileSync(join(tempDir, "fixture.ts"), "await pg.query(`select * from t where id = ${id}`);\n");

    const violations = scanSrc(tempDir);

    expect(violations).toEqual([{ file: join(tempDir, "fixture.ts"), line: 1 }]);
  });

  it("should flag a .query() call built with string concatenation", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raw-sql-src-"));
    writeFileSync(join(tempDir, "fixture.ts"), "await pg.query('select * from t where id = ' + id);\n");

    const violations = scanSrc(tempDir);

    expect(violations).toEqual([{ file: join(tempDir, "fixture.ts"), line: 1 }]);
  });

  it("should not scan *.test.ts or *.integration.test.ts files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "raw-sql-src-"));
    writeFileSync(join(tempDir, "fixture.test.ts"), "await pg.query(`select * from t where id = ${id}`);\n");
    writeFileSync(
      join(tempDir, "fixture.integration.test.ts"),
      "await pg.query(`select * from t where id = ${id}`);\n",
    );

    const violations = scanSrc(tempDir);

    expect(violations).toEqual([]);
  });
});

describe("scanForRawSql against the real repo trees", () => {
  it("should report no violations for the current supabase/migrations and src trees", () => {
    const violations = scanForRawSql({ migrationsDir: "supabase/migrations", srcDir: "src" });

    expect(violations).toEqual([]);
  });
});
