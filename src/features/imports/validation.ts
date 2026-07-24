import {
  ACCEPTED_IMPORT_EXTENSIONS,
  MAX_IMPORT_SIZE_BYTES,
} from "../../lib/constants";

export function validateImportFile(file: Pick<File, "name" | "size">): string | null {
  const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!ACCEPTED_IMPORT_EXTENSIONS.includes(extension as ".xlsx" | ".xls")) {
    return "Only .xlsx and .xls files are accepted.";
  }
  if (file.size > MAX_IMPORT_SIZE_BYTES) {
    return "The file exceeds the 10 MB import limit.";
  }
  return null;
}
