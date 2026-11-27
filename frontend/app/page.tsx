// The start page.
import { BackendStatus } from "./BackendStatus";
import { ImportPanel } from "./ImportPanel";

export default function Home() {
  return (
    <>
      <main className="home">
        <h1>FolderCity</h1>
        <p>Your code base as a city: folders become platforms, files become buildings.</p>
        <BackendStatus />
        <ImportPanel />
      </main>
    </>
  );
}
