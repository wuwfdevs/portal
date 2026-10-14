import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runToolLoop, type LoopTool } from "./tool-loop";

const call = (name: string, args: unknown, id = "call-1") => ({
  type: "function_call",
  call_id: id,
  name,
  arguments: JSON.stringify(args),
});
const message = (text: string) => ({
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
  output_text: text,
  status: "completed",
});
const toolRound = (...calls: unknown[]) => ({
  output: calls,
  output_text: "",
  status: "completed",
});

function fakeClient(responses: unknown[]) {
  const create = vi.fn(async (request: unknown) => {
    void request;
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra call");
    return next;
  });
  return { client: { responses: { create } } as never, create };
}

const baseArgs = {
  step: "synthesis",
  instructions: "Be brief.",
  input: "Go.",
  schemaName: "answer",
  schema: { type: "object" },
};

const echo: LoopTool = {
  name: "echo",
  description: "Echoes.",
  parameters: { type: "object" },
  run: async (args) => ({ heard: args }),
};

describe("runToolLoop", () => {
  it("answers straight away when the model uses no tool", async () => {
    const { client, create } = fakeClient([message('{"ok":true}')]);
    const result = await runToolLoop({ ...baseArgs, tools: [echo], client });
    expect(result).toEqual({ ok: true, text: '{"ok":true}', rounds: 1, calls: [] });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("runs a requested tool, sends its output back with the earlier turns, and returns the final answer", async () => {
    const { client, create } = fakeClient([
      toolRound(call("echo", { q: "water" })),
      message('{"done":1}'),
    ]);
    const run = vi.fn(echo.run);
    const result = await runToolLoop({ ...baseArgs, tools: [{ ...echo, run }], client });

    expect(run).toHaveBeenCalledWith({ q: "water" });
    expect(result).toMatchObject({
      ok: true,
      text: '{"done":1}',
      rounds: 2,
      calls: [{ name: "echo", failed: false }],
    });

    const second = create.mock.calls[1]![0] as {
      input: { type?: string; output?: string }[];
      instructions: string;
    };
    expect(second.instructions).toBe("Be brief.");
    expect(second.input.at(-1)).toMatchObject({ type: "function_call_output", call_id: "call-1" });
    expect(JSON.parse(second.input.at(-1)!.output!)).toEqual({ heard: { q: "water" } });
    expect(second.input.some((item) => item.type === "function_call")).toBe(true);
  });

  it("tells the model when a tool fails or does not exist, and carries on", async () => {
    const { client, create } = fakeClient([
      toolRound(call("boom", {}, "c1"), call("missing", {}, "c2")),
      message("{}"),
    ]);
    const boom: LoopTool = {
      ...echo,
      name: "boom",
      run: async () => {
        throw new Error("The transcript isn't ready.");
      },
    };
    const result = await runToolLoop({ ...baseArgs, tools: [boom], client });
    expect(result).toMatchObject({
      ok: true,
      calls: [
        { name: "boom", failed: true },
        { name: "missing", failed: true },
      ],
    });
    const outputs = (create.mock.calls[1]![0] as { input: { output?: string }[] }).input
      .filter((item) => item.output !== undefined)
      .map((item) => JSON.parse(item.output!));
    expect(outputs).toEqual([
      { error: "The transcript isn't ready." },
      { error: "There is no tool called missing." },
    ]);
  });

  it("makes the model answer once the round limit is reached, instead of looping", async () => {
    const { client, create } = fakeClient([
      toolRound(call("echo", {}, "c1")),
      toolRound(call("echo", {}, "c2")),
      message('{"forced":true}'),
    ]);
    const result = await runToolLoop({ ...baseArgs, tools: [echo], client, maxRounds: 2 });
    expect(result).toMatchObject({ ok: true, text: '{"forced":true}', rounds: 3 });
    const choices = create.mock.calls.map((c) => (c[0] as { tool_choice: string }).tool_choice);
    expect(choices).toEqual(["auto", "auto", "none"]);
  });

  it("fails clearly if the model still asks for a tool when it must answer", async () => {
    const { client } = fakeClient([
      toolRound(call("echo", {}, "c1")),
      toolRound(call("echo", {}, "c2")),
    ]);
    const result = await runToolLoop({ ...baseArgs, tools: [echo], client, maxRounds: 1 });
    expect(result).toMatchObject({ ok: false });
  });

  it("reports a failed, truncated or refused response", async () => {
    for (const [response, expected] of [
      [{ output: [], output_text: "", status: "failed", error: { message: "Bad." } }, "Bad."],
      [{ output: [], output_text: "", status: "incomplete" }, "ran out of room"],
      [
        {
          output: [{ type: "message", content: [{ type: "refusal", refusal: "No." }] }],
          output_text: "",
          status: "completed",
        },
        "declined: No.",
      ],
    ] as const) {
      const { client } = fakeClient([response]);
      const result = await runToolLoop({ ...baseArgs, tools: [], client });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(expected);
    }
  });

  it("sends no tool settings when it has no tools", async () => {
    const { client, create } = fakeClient([message("{}")]);
    await runToolLoop({ ...baseArgs, tools: [], client });
    const sent = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.tools).toBeUndefined();
    expect(sent.tool_choice).toBeUndefined();
  });
});
