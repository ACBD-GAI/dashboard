import type { Profile, ReportType } from "../../types/domain";

export function canEditSi(profile: Profile | null, reportType: ReportType) {
  return (
    profile?.active === true &&
    reportType === "sold_out" &&
    (profile.role === "admin" || profile.role === "staff")
  );
}

export function canArchive(profile: Profile | null) {
  return profile?.active === true && profile.role === "admin";
}

export function canImport(profile: Profile | null) {
  return profile?.active === true && profile.role === "admin";
}

export function canExport(profile: Profile | null) {
  return (
    profile?.active === true &&
    (profile.role === "admin" || profile.role === "staff")
  );
}

export function canClearReport(profile: Profile | null) {
  return profile?.active === true && profile.role === "admin";
}
