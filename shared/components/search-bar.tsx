"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/shared/ui/input";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const currentQuery = searchParams.get("q") || "";

  const [term, setTerm] = useState(currentQuery);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSearching = term !== currentQuery;

  useEffect(() => {
    if (isMobileOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMobileOpen]);

  useEffect(() => {
    if (term === currentQuery) {
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (term) {
        params.set("q", term);
      } else {
        params.delete("q");
      }

      if (pathname.includes("/store")) {
        router.replace(`/store?${params.toString()}`, { scroll: false });
      } else {
        router.push(`/store?${params.toString()}`);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [currentQuery, term, pathname, router, searchParams]);

  return (
    <>
      <div className="hidden md:flex relative w-65 lg:w-75 group">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${term ? "text-foreground" : "text-muted-foreground"}`}
        />
        <Input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full h-10 pl-10 pr-10 bg-[#f5f4f4] border-transparent hover:border-border/80 focus:bg-white outline-none focus:ring-1 focus:ring-foreground text-xs transition-all rounded-none tracking-wide font-medium placeholder:text-muted-foreground/60 text-foreground shadow-none"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          ) : term ? (
            <button
              onClick={() => setTerm("")}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      <button
        className="md:hidden p-2 text-foreground hover:bg-muted transition-colors cursor-pointer rounded-md"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <Search className="w-5 h-5" />
        )}
      </button>

      {isMobileOpen && (
        <div className="absolute top-full left-0 w-full bg-white border-b border-border p-3 md:hidden flex animate-in slide-in-from-top-2 z-50 shadow-sm">
          <div className="relative w-full">
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${term ? "text-foreground" : "text-muted-foreground"}`}
            />
            <Input
              ref={inputRef}
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full h-12 pl-10 pr-10 bg-[#f5f4f4] border-transparent focus:bg-white outline-none focus:ring-1 focus:ring-foreground text-xs transition-all rounded-none uppercase tracking-widest font-bold placeholder:text-muted-foreground/60 text-foreground shadow-none"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              ) : term ? (
                <button
                  onClick={() => setTerm("")}
                  className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
