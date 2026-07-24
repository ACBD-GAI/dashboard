import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../ui/ToastProvider";
import { ClearReportDialog } from "./ClearReportDialog";

const branches = [
  { id: "11111111-1111-4111-8111-111111111111", code: "GAI", name: "Gaisano Iloilo", active: true },
];

describe("ClearReportDialog", () => {
  it("requires the exact branch and report confirmation phrase", async () => {
    render(
      <ToastProvider>
        <ClearReportDialog open branches={branches} onClose={() => undefined} />
      </ToastProvider>,
    );
    const archive = screen.getByRole("button", { name: "Archive report" });
    expect(archive).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Branch"), branches[0].id);
    await userEvent.selectOptions(screen.getByLabelText("Report"), "sold_out");
    await userEvent.type(
      screen.getByLabelText("Type CLEAR GAI sold_out to confirm"),
      "CLEAR GAI sold_out",
    );
    expect(archive).toBeEnabled();
  });
});
