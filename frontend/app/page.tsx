import { BackendStatus } from "./BackendStatus";

export default function Home() {
  return (
    <main className="home">
      <h1>FolderCity</h1>
      <p>Deine Codebasis als Stadt: Ordner werden zu Plattformen, Dateien zu Gebäuden.</p>
      <BackendStatus />
    </main>
  );
}
