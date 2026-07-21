import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase, makeRoutineFile } from "@/test/helpers";
import fullbody3d from "../examples/fullbody-3d.json";
import App from "./App";

beforeEach(clearDatabase);

describe("App", () => {
  it("renders the app shell", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Solorep" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Importar rutina" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Importa una rutina para empezar."),
    ).toBeInTheDocument();
  });

  it("imports a routine file and shows it in the list", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("Importar rutina JSON");
    await user.upload(input, makeRoutineFile(fullbody3d));

    expect(await screen.findByText("Full Body — 3 días")).toBeInTheDocument();
    expect(await screen.findByText("3 días")).toBeInTheDocument();
  });
});
