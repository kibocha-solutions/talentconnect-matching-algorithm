import { describe, expect, it } from "vitest";
import { defaultJobs } from "@/data/default-jobs";
import { jobRecordSchema } from "@/lib/schemas";

describe("default jobs", () => {
  it("contains 15 valid backend-oriented job records", () => {
    expect(defaultJobs).toHaveLength(15);
    for (const job of defaultJobs) {
      expect(jobRecordSchema.safeParse(job).success).toBe(true);
      expect(job.primary_stack).toBeTruthy();
      expect(job.title.toLowerCase()).toContain("engineer");
    }
  });
});
