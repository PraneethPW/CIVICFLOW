import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test(
  "English OCR extracts actual text and requires officer review",
  { skip: process.env.RUN_OCR_TEST !== "1", timeout: 90000 },
  async () => {
    const { recognize } = await import("../src/ocr.ts");
    const result = await recognize(
      await readFile(
        new URL("./fixtures/english-document.png", import.meta.url),
      ),
      "Test document",
    );
    assert.match(result.extracted.text, /Sample Citizen/);
    assert.ok(result.confidence > 70);
    assert.equal(result.verified, false);
  },
);
