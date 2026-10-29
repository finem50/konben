"use client";

import dynamic from "next/dynamic";

/**
 * The app renders the cook's *local* week: day numbers, "today", and dates
 * formatted with the browser's locale. A server has neither their timezone nor
 * their locale, so server-rendering the board produces markup that disagrees
 * with the client and React fails hydration. There is nothing to gain from
 * SSR here either — every byte of state arrives from /api/state after mount.
 */
const Konben = dynamic(() => import("./Konben"), {
  ssr: false,
  loading: () => (
    <div className="konben">
      <div className="konben-shell">
        <header className="konben-top">
          <div className="konben-mark">
            <h1>Konben</h1>
            <span>dinners, kitted and portioned</span>
          </div>
        </header>
      </div>
    </div>
  ),
});

export default function KonbenShell() {
  return <Konben />;
}
