"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-4">Admin</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Metrics" href="/admin/metrics" desc="View request metrics, token counts, and spend." />
        <Card title="Logs" href="/admin/logs" desc="Inspect application logs with rotation." />
      </div>
    </div>
  );
}

function Card({ title, href, desc }: { title: string; href: string; desc: string }) {
  return (
    <Link href={href} className="block rounded border border-foreground/10 p-4 hover:bg-foreground/[0.03]">
      <div className="font-medium">{title}</div>
      <div className="text-sm text-foreground/70">{desc}</div>
    </Link>
  );
}


