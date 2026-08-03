"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Pied de la file de tickets : où en est la lecture, et de quoi avancer.
 *
 * Posé à l'intérieur de la carte du tableau, il reste visible quel que soit le
 * défilement de la liste.
 */
export function TablePagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToPage(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    router.push(`${pathname}?${params.toString()}`);
  }

  const firstOnPage = (page - 1) * pageSize + 1;
  const lastOnPage = Math.min(page * pageSize, total);

  return (
    <div className="flex h-12 items-center justify-between gap-3 border-t bg-muted/30 px-4">
      <p className="text-xs text-muted-foreground">
        {total === 0 && "Aucun ticket"}
        {total > 0 && (
          <>
            <span className="tabular-nums text-foreground">
              {firstOnPage}–{lastOnPage}
            </span>{" "}
            sur <span className="tabular-nums text-foreground">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">
          Page <span className="tabular-nums text-foreground">{page}</span> /{" "}
          <span className="tabular-nums">{Math.max(pageCount, 1)}</span>
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Page précédente"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Page suivante"
          disabled={page >= pageCount}
          onClick={() => goToPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
