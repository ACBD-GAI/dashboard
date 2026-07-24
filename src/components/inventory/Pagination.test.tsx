import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("reports the server-side result window and navigates", async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={2}
        pageSize={20}
        total={53}
        disabled={false}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByText("21–40 of 53")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("disables previous on the first page", () => {
    render(
      <Pagination page={1} pageSize={20} total={1} disabled={false} onPageChange={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });
});
