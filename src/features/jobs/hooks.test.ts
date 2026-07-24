import { describe, expect, it } from "vitest";
import { shouldPollJobs } from "./hooks";

describe("job polling", () => {
  it("continues only while a job is pending or running", () => {
    expect(shouldPollJobs(["completed", "failed"])).toBe(false);
    expect(shouldPollJobs(["completed", "pending"])).toBe(true);
    expect(shouldPollJobs(["running"])).toBe(true);
  });
});
