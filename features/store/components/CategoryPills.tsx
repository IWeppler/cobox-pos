import { Button } from "@/shared/ui/button";
import { CategoriaConStock } from "../hooks/use-catalog-filters";

interface CategoryPillsProps {
  tipo: string;
  categoriasConStock: CategoriaConStock[];
  onTipoChange: (tipo: string) => void;
}

export function CategoryPills({
  tipo,
  categoriasConStock,
  onTipoChange,
}: Readonly<CategoryPillsProps>) {
  return (
    <div className="flex gap-2 overflow-x-auto bg-background py-1 scrollbar-hide w-full top-16 z-20">
      <Button
        variant={tipo === "todos" ? "default" : "outline"}
        className={`rounded-full h-12 md:h-9 px-5 text-xs font-semibold shrink-0 shadow-none border-border/60 transition-colors ${
          tipo === "todos"
            ? "bg-neutral-900 text-white border-transparent hover:bg-neutral-800"
            : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        onClick={() => onTipoChange("todos")}
      >
        Ver todo
      </Button>

      {categoriasConStock.map((cat) => (
        <Button
          key={cat.id}
          variant={tipo === cat.id ? "default" : "outline"}
          className={`rounded-full h-12 md:h-9 px-5 text-xs font-semibold shrink-0 shadow-none border-border/60 transition-colors ${
            tipo === cat.id
              ? "bg-foreground text-background border-transparent hover:bg-foreground/90"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          onClick={() => onTipoChange(cat.id)}
        >
          {cat.nombre}{" "}
          <span className="ml-1.5 opacity-60 font-normal">({cat.count})</span>
        </Button>
      ))}
    </div>
  );
}
