import { LoaderCircle } from "lucide-react";

interface FullPageStateProps {
  title: string;
  message?: string;
  busy?: boolean;
}

export function FullPageState({ title, message, busy = false }: FullPageStateProps) {
  return (
    <main className="full-page-state" role={busy ? "status" : "alert"}>
      <div className="state-card">
        {busy && <LoaderCircle className="spin" aria-hidden="true" />}
        <h1>{title}</h1>
        {message && <p>{message}</p>}
      </div>
    </main>
  );
}
