import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildExportEnvelope } from "@/lib/export-store";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ExportDataButton() {
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    try {
      const envelope = await buildExportEnvelope();
      const json = JSON.stringify(envelope, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `solorep-export-${formatLocalDate(new Date())}.json`;
      anchor.click();
      // Deferred: WebKit can abort the download if the URL is revoked
      // before its async fetch starts.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setError(null);
    } catch {
      setError("No se pudieron exportar los datos.");
    }
  };

  const hasError = error !== null;

  return (
    <div className="contents">
      <Button
        data-test="export-data-trigger"
        variant="ghost"
        size="icon-sm"
        className="justify-self-end"
        aria-label="Exportar datos"
        onClick={handleClick}
      >
        <Download />
      </Button>
      {hasError && (
        <p
          data-test="export-data-error"
          role="alert"
          className="col-span-full text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
