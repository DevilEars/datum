import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function DrawioDialog({
  open,
  xml,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  xml: string;
  onOpenChange: (open: boolean) => void;
  onSave: (xml: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const xmlRef = useRef(xml);
  xmlRef.current = xml;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSlow(false);
    let ready = false;
    const timer = window.setTimeout(() => {
      if (!ready) setSlow(true);
    }, 8000);
    const onMessage = (event: MessageEvent) => {
      if (!String(event.origin).includes("diagrams.net") && !String(event.origin).includes("draw.io")) return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== "object") return;
      const msg = data as { event?: string; xml?: string };
      if (msg.event === "init") {
        ready = true;
        setSlow(false);
        frame.current?.contentWindow?.postMessage(
          JSON.stringify({ action: "load", xml: xmlRef.current, autosave: 1 }),
          "*",
        );
      }
      if ((msg.event === "save" || msg.event === "autosave") && typeof msg.xml === "string") {
        onSaveRef.current(msg.xml);
        if (msg.event === "save") {
          frame.current?.contentWindow?.postMessage(
            JSON.stringify({ action: "status", message: "Saved to Datum", modified: false }),
            "*",
          );
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-sheet" aria-describedby="drawio-hint">
          <div className="dialog-bar">
            <Dialog.Title className="dialog-title">Edit in diagrams.net</Dialog.Title>
            <p id="drawio-hint" className="muted">
              Saves write back onto this plate as draw.io XML.
            </p>
            <Dialog.Close asChild>
              <Button variant="quiet" size="sm">
                Close
              </Button>
            </Dialog.Close>
          </div>
          {slow ? <p className="banner">The editor has not answered yet. You can still download the .drawio file.</p> : null}
          <iframe
            ref={frame}
            title="diagrams.net editor"
            className="drawio-frame"
            src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min&libraries=1&saveAndExit=0&noExitBtn=1"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
