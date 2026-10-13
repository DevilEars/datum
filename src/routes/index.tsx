import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/studio";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) {
    return (
      <main className="studio">
        <header className="studio-header">
          <div className="word">Datum</div>
        </header>
      </main>
    );
  }
  return <Studio />;
}
