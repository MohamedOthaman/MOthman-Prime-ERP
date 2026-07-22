import { describe, it, expect } from "vitest";
import { classifyError } from "@/sync/errors";

describe("classifyError — permanent (do not retry blindly)", () => {
  it("RLS / insufficient privilege is permanent", () => {
    const c = classifyError({ code: "42501", message: "new row violates row-level security policy" });
    expect(c.permanent).toBe(true);
    expect(c.message).toMatch(/row-level security/i);
  });

  it("not-signed-in is permanent", () => {
    expect(classifyError({ code: "28000", message: "Not signed in" }).permanent).toBe(true);
  });

  it("missing RPC/function (PGRST202) is permanent with a migration hint", () => {
    const c = classifyError({ code: "PGRST202", message: "Could not find function" });
    expect(c.permanent).toBe(true);
    expect(c.hint).toMatch(/migration/i);
  });

  it("explicit RAISE (P0001) is permanent", () => {
    expect(classifyError({ code: "P0001", message: "Role read_only is not permitted" }).permanent).toBe(true);
  });

  it("unique violation is permanent", () => {
    expect(classifyError({ code: "23505", message: "duplicate key" }).permanent).toBe(true);
  });

  it("missing storage bucket is permanent", () => {
    const c = classifyError({ status: 400, message: "Bucket not found" });
    expect(c.permanent).toBe(true);
    expect(c.code).toBe("BUCKET_MISSING");
    expect(c.hint).toMatch(/20260706120000/);
  });

  it("generic 4xx is permanent", () => {
    expect(classifyError({ status: 400, message: "Bad Request" }).permanent).toBe(true);
  });
});

describe("classifyError — retryable (transient)", () => {
  it("network failure is retryable", () => {
    const c = classifyError({ message: "Failed to fetch" });
    expect(c.permanent).toBe(false);
    expect(c.retryable).toBe(true);
    expect(c.code).toBe("NETWORK_UNAVAILABLE");
  });

  it("5xx server error is retryable", () => {
    expect(classifyError({ status: 503, message: "Service Unavailable" }).permanent).toBe(false);
  });

  it("429 rate limit is retryable", () => {
    expect(classifyError({ status: 429, message: "Too Many Requests" }).permanent).toBe(false);
  });

  it("unknown error defaults to retryable", () => {
    expect(classifyError({ message: "something odd" }).permanent).toBe(false);
  });

  it("expired sessions include a sign-in remediation", () => {
    const c = classifyError({ status: 401, message: "JWT expired" });
    expect(c.permanent).toBe(true);
    expect(c.hint).toMatch(/sign in/i);
  });
});
