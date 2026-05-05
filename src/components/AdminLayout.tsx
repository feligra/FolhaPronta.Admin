import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";

/**
 * Layout do admin: sidebar fixa + área principal preenchendo o restante.
 * Sem `max-w-6xl mx-auto` (versão antiga centralizava o conteúdo numa coluna
 * estreita, fazendo as tabelas grandes parecerem flutuando). Aqui o conteúdo
 * usa toda a largura disponível, com padding fixo nas laterais e teto leve
 * (`max-w-[1600px]`) só pra evitar tables-de-3-metros em telas ultrawide.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen lg:h-screen lg:overflow-hidden">
      <Sidebar />
      <main className="w-full min-w-0 flex-1 overflow-auto pt-14 lg:pt-0">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
