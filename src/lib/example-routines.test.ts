import { describe, expect, it } from "vitest";
import fullbody3d from "../../examples/fullbody-3d.json";
import miniSession from "../../examples/mini-session.json";
import { parseRoutine } from "./routine-schema";

describe("example routines", () => {
  it("examples/fullbody-3d.json is a valid routine", () => {
    const routine = parseRoutine(fullbody3d);

    expect(routine.id).toBe("fullbody-3d");
    expect(routine.days).toHaveLength(3);
  });

  it("examples/mini-session.json is a valid routine", () => {
    const routine = parseRoutine(miniSession);

    expect(routine.id).toBe("mini-session");
    expect(routine.days).toHaveLength(2);
  });
});
