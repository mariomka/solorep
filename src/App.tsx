import { ImportRoutineButton } from "@/components/import-routine-button";
import { RoutineList } from "@/components/routine-list";

function App() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 p-4">
      <h1 className="font-heading text-4xl font-bold">Solorep</h1>
      <RoutineList />
      <ImportRoutineButton />
    </main>
  );
}

export default App;
