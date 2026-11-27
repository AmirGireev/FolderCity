// The start page.
import { BackendStatus } from "./BackendStatus";
import { ImportPanel } from "./ImportPanel";

export default function Home() {
  return (
    <main className="home">
      <header className="hero">
        <h1>
          Folder<span>City</span>
        </h1>
        <p>Your code base as a city: folders become platforms, files become buildings.</p>
        <BackendStatus />
      </header>
      <ImportPanel />
    </main>
  );
}
