import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { importRoutineFromFile } from "@/lib/routine-store";

interface ImportRoutineButtonProps {
  mode?: "primary" | "menu";
}

export function ImportRoutineButton({
  mode = "primary",
}: ImportRoutineButtonProps) {
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
  const isMenuMode = mode === "menu";

  const fileInput = (
    <input
      data-test="import-routine-input"
      ref={inputRef}
      type="file"
      accept=".json,application/json"
      className="sr-only"
      aria-label="Importar rutina JSON"
      onChange={handleFileChange}
    />
  );

  if (isMenuMode) {
    return (
      <div className="contents">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              data-test="routines-menu-trigger"
              variant="ghost"
              size="icon-sm"
              className="justify-self-end"
              aria-label="Opciones de rutinas"
            >
              <Plus />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem
              data-test="import-routine-menu-item"
              onSelect={handleButtonClick}
            >
              <Plus />
              Importar rutina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {fileInput}
        {hasError && (
          <p
            data-test="import-routine-error"
            role="alert"
            className="col-span-2 text-sm whitespace-pre-line text-destructive"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        data-test="import-routine-trigger"
        className="w-full"
        onClick={handleButtonClick}
      >
        Importar rutina
      </Button>
      {fileInput}
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
