"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login?callback=/admin");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <nav className="flex items-center gap-4 text-sm">
            <Link className={navCls(isActive("/admin"))} href="/admin">Admin</Link>
            <Link className={navCls(isActive("/admin/metrics"))} href="/admin/metrics">Metrics</Link>
            <Link className={navCls(isActive("/admin/logs"))} href="/admin/logs">Logs</Link>
          </nav>
          <button onClick={logout} className="px-3 py-1.5 rounded border border-foreground/20 text-sm">Logout</button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function navCls(active: boolean) {
  return active ? "underline" : "hover:underline";
}


