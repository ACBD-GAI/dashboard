import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "../../features/auth/AuthProvider";

vi.mock("../../features/auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const authBase = {
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
  error: null,
  loading: false,
};

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route index element={<div>Private inventory</div>} />
        </Route>
        <Route path="/login" element={<div>Login destination</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects an unauthenticated visitor to login", () => {
    mockedUseAuth.mockReturnValue({ ...authBase, session: null, profile: null });
    renderGuard();
    expect(screen.getByText("Login destination")).toBeInTheDocument();
  });

  it("blocks an inactive profile even with a session", () => {
    mockedUseAuth.mockReturnValue({
      ...authBase,
      session: { user: { id: "user" } } as never,
      profile: {
        id: "user",
        email: "viewer@example.test",
        display_name: null,
        role: "viewer",
        active: false,
      },
    });
    renderGuard();
    expect(screen.getByText("Unauthorized destination")).toBeInTheDocument();
  });
});
