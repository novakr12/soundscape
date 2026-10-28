import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { redirect } from "next/navigation";
import BrandLink from "@/components/brand-link";
import Credit from "@/components/credit";
import NavLink from "@/components/nav-link";
import { PlayerProvider } from "@/components/player";
import { isAdmin } from "@/lib/admin";
import { currentUserId, logOut } from "@/lib/session";
import { signupMode } from "@/lib/signups";
import "./globals.css";

const brandFont = Space_Grotesk({ subsets: ["latin"], weight: "700", variable: "--font-brand" });

export const metadata: Metadata = {
  title: "Soundscape",
  description: "Play history, recommendations and live charts.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const username = await currentUserId();

  async function logout() {
    "use server";
    await logOut();
    redirect("/");
  }

  return (
    <html lang="en" className={brandFont.variable}>
      <body>
        <header>
          <BrandLink />
          <form action="/search" role="search" className="search">
            <input type="search" name="q" placeholder="Search" aria-label="Search songs, artists, albums and users" />
          </form>
          <nav>
            <NavLink href="/feed">Feed</NavLink>
            <NavLink href="/history">History</NavLink>
            <NavLink href="/charts">Charts</NavLink>
            <NavLink href="/recommendations">Recommendations</NavLink>
            <NavLink href="/mixes">Mixes</NavLink>
            <NavLink href="/stats">Stats</NavLink>
            <NavLink href="/yearscape">Yearscape</NavLink>
            <NavLink href="/import">Import</NavLink>
            <NavLink href="/export">Export</NavLink>
            <NavLink href="/connect">Connect</NavLink>
          </nav>
          <div className="account">
            {username ? (
              <>
                <NavLink href={`/u/${username}`}>{username}</NavLink>
                <NavLink href="/settings">Settings</NavLink>
                {isAdmin(username) && <NavLink href="/admin">Admin</NavLink>}
                <form action={logout}>
                  <button type="submit">Log out</button>
                </form>
              </>
            ) : (
              <>
                <NavLink href="/login">Log in</NavLink>
                {signupMode() === "open" && <NavLink href="/signup">Sign up</NavLink>}
              </>
            )}
          </div>
        </header>
        <PlayerProvider>
          <main>
            {children}
            <Credit />
          </main>
        </PlayerProvider>
      </body>
    </html>
  );
}
