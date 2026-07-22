import { describe, expect, it } from "vitest";
import { isActive, isActiveAdministrator } from "./predicates";
import type { Profile } from "./session";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "dana.ruiz@wuwf.org",
    display_name: "Dana Ruiz",
    platform_role: "staff",
    account_status: "active",
    invited_by: null,
    last_active_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("isActive", () => {
  it("is false for a null profile", () => {
    expect(isActive(null)).toBe(false);
  });

  it("is false for invited, pending, or disabled accounts", () => {
    expect(isActive(makeProfile({ account_status: "invited" }))).toBe(false);
    expect(isActive(makeProfile({ account_status: "pending" }))).toBe(false);
    expect(isActive(makeProfile({ account_status: "disabled" }))).toBe(false);
  });

  it("is true only for active accounts", () => {
    expect(isActive(makeProfile({ account_status: "active" }))).toBe(true);
  });
});

describe("isActiveAdministrator", () => {
  it("requires both an active account and the administrator role", () => {
    expect(isActiveAdministrator(makeProfile({ platform_role: "administrator", account_status: "active" }))).toBe(
      true,
    );
  });

  it("rejects a disabled administrator", () => {
    expect(
      isActiveAdministrator(makeProfile({ platform_role: "administrator", account_status: "disabled" })),
    ).toBe(false);
  });

  it("rejects an active non-administrator", () => {
    expect(isActiveAdministrator(makeProfile({ platform_role: "staff", account_status: "active" }))).toBe(false);
  });

  it("rejects a null profile", () => {
    expect(isActiveAdministrator(null)).toBe(false);
  });
});
