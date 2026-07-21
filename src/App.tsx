import { Button } from "@/components/ui/button";

function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="font-heading text-4xl font-bold">Solorep</h1>
      <p className="text-muted-foreground">Importa una rutina para empezar.</p>
      <Button>Importar rutina</Button>
    </main>
  );
}

export default App;
