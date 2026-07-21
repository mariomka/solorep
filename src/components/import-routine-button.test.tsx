import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { importRoutineFromFile } from "@/lib/routine-store";
import {
  clearDatabase,
  makeMalformedRoutineFile,
  makeRoutineFile,
} from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { ImportRoutineButton } from "./import-routine-button";

vi.mock("@/lib/routine-store", { spy: true });

beforeEach(clearDatabase);

describe("ImportRoutineButton", () => {
  it("imports a valid file without showing an error", async () => {
    const user = userEvent.setup();
    render(<ImportRoutineButton />);

    const input = screen.getByLabelText("Importar rutina JSON");
    await user.upload(input, makeRoutineFile(fullbody3d));

    await waitFor(async () => {
      await expect(db.routines.count()).resolves.toBe(1);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error for a malformed file and leaves the database empty", async () => {
    const user = userEvent.setup();
    render(<ImportRoutineButton />);

    const input = screen.getByLabelText("Importar rutina JSON");
    await user.upload(input, makeMalformedRoutineFile());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("El archivo no es JSON válido.");
    await expect(db.routines.count()).resolves.toBe(0);
  });

  it("clears the error after a valid import follows a failed one", async () => {
    const user = userEvent.setup();
    render(<ImportRoutineButton />);

    const input = screen.getByLabelText("Importar rutina JSON");
    await user.upload(input, makeMalformedRoutineFile());
    await screen.findByRole("alert");

    await user.upload(input, makeRoutineFile(fullbody3d));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    await expect(db.routines.count()).resolves.toBe(1);
  });

  it("shows a generic error when the import rejects and still accepts the same file again", async () => {
    vi.mocked(importRoutineFromFile).mockRejectedValueOnce(
      new Error("quota exceeded"),
    );

    const user = userEvent.setup();
    render(<ImportRoutineButton />);

    const input = screen.getByLabelText("Importar rutina JSON");
    const file = makeRoutineFile(fullbody3d);

    await user.upload(input, file);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo importar la rutina.");
    await expect(db.routines.count()).resolves.toBe(0);

    await user.upload(input, file);

    await waitFor(async () => {
      await expect(db.routines.count()).resolves.toBe(1);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("imports the same file twice because the input value is reset", async () => {
    const user = userEvent.setup();
    render(<ImportRoutineButton />);

    const input = screen.getByLabelText("Importar rutina JSON");
    const file = makeRoutineFile(fullbody3d);

    await user.upload(input, file);
    await waitFor(async () => {
      await expect(db.routines.count()).resolves.toBe(1);
    });

    await db.routines.clear();

    await user.upload(input, file);
    await waitFor(async () => {
      await expect(db.routines.count()).resolves.toBe(1);
    });
  });
});
