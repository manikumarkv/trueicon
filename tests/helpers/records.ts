import { expect } from "vitest";
import type { IconRecord } from "../../src/indexer/types.js";

// Every record must carry the full IconRecord shape with the right id prefix.
export function expectRecordShape(record: IconRecord, idPrefix: string): void {
  expect(record.id).toBe(`${idPrefix}:${record.name}`);
  expect(record.id).toMatch(/^[@\w/-]+@\d+\.\d+:[\w-]+$/);
  expect(record.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  expect(typeof record.importName).toBe("string");
  expect(typeof record.importPath).toBe("string");
  expect(Array.isArray(record.categories)).toBe(true);
  expect(Array.isArray(record.tags)).toBe(true);
  expect(record.keywords.length).toBeGreaterThan(0);
  expect(record.svg).toMatch(/^<\w+/);
}
