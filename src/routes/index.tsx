import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/studio";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const pages = import.meta.env.VITE_DATUM_STATIC === "1";
  const [ready, setReady] = useState(pages);
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
