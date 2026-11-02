import { describe, expect, it, vi } from "vitest";
import { removeUploadedObject, uploadObject, type StorageClientLike } from "./upload-object";

function clientWith(
  upload: (...args: unknown[]) => Promise<{ error: (Error & { status?: number }) | null }>,
) {
  const remove = vi.fn(async () => ({}));
  const client = { storage: { from: () => ({ upload, remove }) } } as unknown as StorageClientLike;
  return { client, remove };
}

const file = new Blob(["abc"], { type: "text/plain" });
const base = { bucket: "b", path: "p", body: file, contentType: "text/plain" };

describe("uploadObject", () => {
  it("succeeds", async () => {
    const { client } = clientWith(async () => ({ error: null }));
    expect(await uploadObject({ client, ...base })).toEqual({ ok: true });
  });

  it("explains a size refusal", async () => {
    const { client } = clientWith(async () => ({
      error: Object.assign(new Error("The object exceeded the maximum allowed size"), {
        status: 413,
      }),
    }));
    const result = await uploadObject({ client, ...base });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/over the upload limit/);
  });

  it("passes another refusal's message through", async () => {
    const { client } = clientWith(async () => ({ error: new Error("Duplicate") }));
    const result = await uploadObject({ client, ...base });
    expect(result).toEqual({ ok: false, message: "Duplicate" });
  });

  it("turns a thrown failure into a message and cleans up on request", async () => {
    const { client, remove } = clientWith(async () => {
      throw new Error("network");
    });
    const result = await uploadObject({ client, ...base, cleanup: true });
    expect(result.ok).toBe(false);
    expect(remove).toHaveBeenCalledWith(["p"]);
  });

  it("does not clean up a plain refusal", async () => {
    const { client, remove } = clientWith(async () => ({ error: new Error("no") }));
    await uploadObject({ client, ...base, cleanup: true });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("removeUploadedObject", () => {
  it("swallows a failure", async () => {
    const client = {
      storage: {
        from: () => ({
          remove: async () => {
            throw new Error("x");
          },
        }),
      },
    } as unknown as StorageClientLike;
    await expect(removeUploadedObject(client, "b", "p")).resolves.toBeUndefined();
  });
});
