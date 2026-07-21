import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { importRoutineFromFile } from "@/lib/routine-store";

export function ImportRoutineButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const hasFile = file !== undefined;

    try {
      if (hasFile) {
        const result = await importRoutineFromFile(file);
        if (result.ok) {
          setError(null);
        } else {
          setError(result.error);
        }
      }
    } catch {
      setError("No se pudo importar la rutina.");
    } finally {
      input.value = "";
    }
  };

  const hasError = error !== null;

  return (
    <div className="flex flex-col gap-2">
      <Button data-test="import-routine-trigger" onClick={handleButtonClick}>
        Importar rutina
      </Button>
      <input
        ref={inputRef}
        data-test="import-routine-input"
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label="Importar rutina JSON"
        onChange={handleFileChange}
      />
      {hasError && (
        <p
          data-test="import-routine-error"
          role="alert"
          className="text-destructive text-sm whitespace-pre-line"
        >
          {error}
        </p>
      )}
    </div>
  );
}
