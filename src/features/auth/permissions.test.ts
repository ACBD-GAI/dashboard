import { describe, expect, it } from "vitest";
import {
  canArchive,
  canClearReport,
  canEditSi,
  canExport,
  canImport,
} from "./permissions";
import type { Profile, UserRole } from "../../types/domain";

function profile(role: UserRole, active = true): Profile {
  return {
    id: "user",
    email: "user@example.test",
    display_name: null,
    role,
    active,
  };
}

describe("role permissions", () => {
  it("gives active admins all operational capabilities", () => {
    const admin = profile("admin");
    expect(canEditSi(admin, "sold_out")).toBe(true);
    expect(canArchive(admin)).toBe(true);
    expect(canImport(admin)).toBe(true);
    expect(canExport(admin)).toBe(true);
    expect(canClearReport(admin)).toBe(true);
  });

  it("limits staff and viewers", () => {
    expect(canEditSi(profile("staff"), "sold_out")).toBe(true);
    expect(canEditSi(profile("staff"), "stocks")).toBe(false);
    expect(canExport(profile("staff"))).toBe(true);
    expect(canImport(profile("staff"))).toBe(false);
    expect(canArchive(profile("staff"))).toBe(false);
    expect(canEditSi(profile("viewer"), "sold_out")).toBe(false);
    expect(canExport(profile("viewer"))).toBe(false);
  });

  it("denies every inactive profile", () => {
    const inactive = profile("admin", false);
    expect(canEditSi(inactive, "sold_out")).toBe(false);
    expect(canImport(inactive)).toBe(false);
    expect(canClearReport(inactive)).toBe(false);
  });
});
