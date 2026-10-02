import { connection } from "next/server";

export default async function HomePage() {
  await connection();
  return (
    <main>
      <h1>WayLoom</h1>
      <p>Frontend foundation is running.</p>
    </main>
  );
}
