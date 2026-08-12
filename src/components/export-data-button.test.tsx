import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { buildExportEnvelope } from "@/lib/export-store";
import { parseRoutine } from "@/lib/routine-schema";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { ExportDataButton } from "./export-data-button";

vi.mock("@/lib/export-store", { spy: true });

const routine = parseRoutine(fullbody3d);

const createObjectURL = vi.fn((_blob: Blob) => "blob:solorep-export");
const revokeObjectURL = vi.fn();
let downloadedName: string | null = null;

beforeEach(async () => {
  await clearDatabase();
  downloadedName = null;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  // jsdom has no object URL implementation.
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function captureDownload(this: HTMLAnchorElement) {
      downloadedName = this.download;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportDataButton", () => {
  it("downloads the envelope as a dated JSON file", async () => {
    await db.routines.put({ id: routine.id, routine, importedAt: 1000 });
    await db.lastUsed.put({
      exerciseKey: "back-squat",
      weight: 60,
      updatedAt: 3000,
    });

    const user = userEvent.setup();
    render(<ExportDataButton />);

    await user.click(screen.getByTestId("export-data-trigger"));

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    await waitFor(() => {
      expect(downloadedName).toBe(
        `solorep-export-${year}-${month}-${day}.json`,
      );
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/json");
    const parsed = JSON.parse(await blob.text());
    expect(parsed).toMatchObject({
      version: 2,
      data: {
        routines: [{ id: routine.id, importedAt: 1000 }],
        progress: [],
        sessions: [],
        lastUsed: [{ exerciseKey: "back-squat", weight: 60, updatedAt: 3000 }],
      },
    });
    expect(parsed.data).not.toHaveProperty("activeSession");

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:solorep-export");
    });
    expect(screen.queryByTestId("export-data-error")).not.toBeInTheDocument();
  });

  it("shows an error when the export fails and clears it on a later success", async () => {
    vi.mocked(buildExportEnvelope).mockRejectedValueOnce(
      new Error("read failed"),
    );

    const user = userEvent.setup();
    render(<ExportDataButton />);

    await user.click(screen.getByTestId("export-data-trigger"));

    const alert = await screen.findByTestId("export-data-error");
    expect(alert).toHaveTextContent("No se pudieron exportar los datos.");
    expect(createObjectURL).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("export-data-trigger"));

    await waitFor(() => {
      expect(screen.queryByTestId("export-data-error")).not.toBeInTheDocument();
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
