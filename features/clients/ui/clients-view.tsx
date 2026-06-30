"use client";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Edit2,
  FileText,
  MoreVertical,
  PlusCircle,
  Search,
  UploadCloud,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { Cliente } from "@/entities/clientes/type";
import { MetodoPago } from "@/entities/payments/types";
import { formatearMoneda } from "@/shared/utils/formatters";
import { CreateClientModal } from "./add-client-modal";
import { AdjustClientBalanceModal } from "./adjust-client-balance-modal";
import { ClientDetailSheet } from "./client-detail-sheet";
import { EditClientModal } from "./edit-client-modal";
import { ImportClientsCsvModal } from "./import-clients-csv-modal";

type SortConfig = {
  key: "nombre" | "deuda" | "ltv";
  direction: "asc" | "desc";
};
const CLIENTS_PER_PAGE = 10;

type ClienteVentaResumen = {
  total?: number | string | null;
  fecha_venta?: string | null;
};

type ClienteConVentas = Cliente & {
  ventas?: ClienteVentaResumen[] | null;
};

type ClienteMapeado = ClienteConVentas & {
  cantidadVentas: number;
  totalComprado: number;
  ultimaCompra: string | null;
};

interface ClientsViewProps {
  clientes: ClienteConVentas[];
  metodosPago: MetodoPago[];
}

export function ClientsView({
  clientes,
  metodosPago,
}: Readonly<ClientsViewProps>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "ltv",
    direction: "desc",
  });
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [clientToEdit, setClientToEdit] = useState<Cliente | null>(null);
  const [clientToAdjust, setClientToAdjust] = useState<Cliente | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const totalClientes = clientes.length;
  const morosos = clientes.filter(
    (cliente) => Number(cliente.saldo_pendiente || 0) > 0,
  );
  const dineroEnCalle = morosos.reduce(
    (total, cliente) => total + Number(cliente.saldo_pendiente || 0),
    0,
  );

  const clientesMapeados = useMemo<ClienteMapeado[]>(() => {
    return clientes.map((cliente) => {
      const ventas = cliente.ventas || [];
      const totalComprado = ventas.reduce(
        (total, venta) => total + Number(venta.total || 0),
        0,
      );
      const ultimaCompra =
        ventas
          .map((venta) => venta.fecha_venta)
          .filter((fecha): fecha is string => Boolean(fecha))
          .sort(
            (a, b) => new Date(b).getTime() - new Date(a).getTime(),
          )[0] || null;

      return {
        ...cliente,
        cantidadVentas: ventas.length,
        totalComprado,
        ultimaCompra,
      };
    });
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    let result = clientesMapeados.filter(
      (cliente) =>
        cliente.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cliente.telefono && cliente.telefono.includes(searchQuery)),
    );

    if (filterStatus === "con_deuda") {
      result = result.filter((cliente) => Number(cliente.saldo_pendiente) > 0);
    } else if (filterStatus === "al_dia") {
      result = result.filter((cliente) => Number(cliente.saldo_pendiente) <= 0);
    }

    result.sort((a, b) => {
      if (sortConfig.key === "nombre") {
        return sortConfig.direction === "asc"
          ? a.nombre.localeCompare(b.nombre)
          : b.nombre.localeCompare(a.nombre);
      }

      if (sortConfig.key === "ltv") {
        return sortConfig.direction === "asc"
          ? a.totalComprado - b.totalComprado
          : b.totalComprado - a.totalComprado;
      }

      const deudaA = Number(a.saldo_pendiente);
      const deudaB = Number(b.saldo_pendiente);
      return sortConfig.direction === "asc" ? deudaA - deudaB : deudaB - deudaA;
    });

    return result;
  }, [clientesMapeados, searchQuery, filterStatus, sortConfig]);

  const totalPages = Math.max(
    1,
    Math.ceil(clientesFiltrados.length / CLIENTS_PER_PAGE),
  );
  const effectiveCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (effectiveCurrentPage - 1) * CLIENTS_PER_PAGE;
  const pageEnd = pageStart + CLIENTS_PER_PAGE;
  const clientesPaginados = clientesFiltrados.slice(pageStart, pageEnd);
  const visibleStart = clientesFiltrados.length === 0 ? 0 : pageStart + 1;
  const visibleEnd = Math.min(pageEnd, clientesFiltrados.length);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleFilterChange = (status: string) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };

  const handleSort = (columna: SortConfig["key"]) => {
    setSortConfig((current) => {
      if (current.key === columna) {
        return {
          key: columna,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return { key: columna, direction: "asc" };
    });
    setCurrentPage(1);
  };

  const renderSortIcon = (columna: SortConfig["key"]) => {
    if (sortConfig.key !== columna) {
      return (
        <ArrowUpDown className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
      );
    }

    return sortConfig.direction === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 shrink-0 text-foreground" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 shrink-0 text-foreground" />
    );
  };

  return (
    <div className="flex flex-col gap-4 px-4 p-2">
      {/* ── KPIs SUPERIORES ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dinero en la Calle
            </CardTitle>
            <Wallet className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatearMoneda(dineroEnCalle)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Capital a cobrar
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cuentas con Deuda
            </CardTitle>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {morosos.length}{" "}
              <span className="text-sm font-normal">clientes</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Con saldo pendiente
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes activos
            </CardTitle>
            <Users className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {totalClientes}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              En tu base de datos
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2 pt-2">
        <div className="relative w-full sm:w-80 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o telefono..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-10 bg-muted border border-border rounded-xl"
          />
        </div>

        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50 overflow-x-auto">
            <button
              onClick={() => handleFilterChange("todos")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${filterStatus === "todos" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Todos
            </button>
            <button
              onClick={() => handleFilterChange("con_deuda")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${filterStatus === "con_deuda" ? "bg-background text-accent-orange" : "text-muted-foreground hover:text-accent-orange"}`}
            >
              Morosos
            </button>
            <button
              onClick={() => handleFilterChange("al_dia")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${filterStatus === "al_dia" ? "bg-background text-emerald-600 dark:text-accent-lime" : "text-muted-foreground hover:text-emerald-600 dark:hover:text-accent-lime"}`}
            >
              Al Dia
            </button>
          </div>

          <div className="hidden sm:flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportOpen(true)}
              className="h-10 shadow-none border-border"
            >
              <UploadCloud className="w-5 h-5 mr-2" /> Importar CSV
            </Button>
            <CreateClientModal />
          </div>
        </div>
      </div>

      <div className="sm:hidden px-2 pb-2 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsImportOpen(true)}
          className="flex-1"
        >
          <UploadCloud className="w-4 h-4 mr-2" /> Importar
        </Button>
        <div className="flex-1">
          <CreateClientModal />
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-none overflow-hidden mt-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted text-muted-foreground text-[10px] md:text-xs uppercase font-medium tracking-wide border-b border-border/60">
              <tr>
                <th
                  className="px-5 py-4 text-left"
                  onClick={() => handleSort("nombre")}
                >
                  <div className="flex items-center gap-1.5">
                    Cliente {renderSortIcon("nombre")}
                  </div>
                </th>
                <th className="px-5 py-4">Estado</th>
                <th className="px-5 py-4 hidden sm:table-cell">Contacto</th>
                <th
                  className="px-5 py-4 hidden md:table-cell text-right"
                  onClick={() => handleSort("ltv")}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Total comprado {renderSortIcon("ltv")}
                  </div>
                </th>
                <th
                  className="px-5 py-4 text-right"
                  onClick={() => handleSort("deuda")}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Deuda Actual {renderSortIcon("deuda")}
                  </div>
                </th>
                <th className="px-5 py-4 hidden lg:table-cell">
                  Ultima compra
                </th>
                <th className="px-5 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {clientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Users className="w-8 h-8 opacity-20 mb-2" />
                      <p className="font-medium">No se encontraron clientes.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                clientesPaginados.map((cliente) => {
                  const saldo = Number(cliente.saldo_pendiente || 0);
                  const isAlDia = saldo <= 0;

                  return (
                    <tr
                      key={cliente.id}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {cliente.nombre}
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            {cliente.dni
                              ? `DNI: ${cliente.dni}`
                              : "Sin DNI registrado"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span
                              className={`relative inline-flex rounded-full h-2 w-2 ${isAlDia ? "bg-emerald-500 dark:bg-accent-lime" : "bg-accent-orange"}`}
                            />
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-widest ${isAlDia ? "text-emerald-700 dark:text-accent-lime" : "text-accent-orange"}`}
                          >
                            {isAlDia ? "Al dia" : "Con Deuda"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 hidden sm:table-cell">
                        <div className="flex flex-col text-xs font-medium text-muted-foreground">
                          <span>{cliente.telefono || "-"}</span>
                          {cliente.email ? (
                            <span className="text-[10px] opacity-80">
                              {cliente.email}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-5 py-4 hidden md:table-cell text-right">
                        <div className="flex flex-col">
                          <span className="font-medium text-muted-foreground">
                            {formatearMoneda(cliente.totalComprado)}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        {saldo > 0 ? (
                          <span className="font-semibold text-foreground px-2 py-0.5 shadow-none text-sm">
                            {formatearMoneda(saldo)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 font-bold text-lg">
                            -
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-xs font-medium text-muted-foreground">
                          {cliente.ultimaCompra
                            ? new Intl.DateTimeFormat("es-AR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              }).format(new Date(cliente.ultimaCompra))
                            : "Sin compras"}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedClient(cliente)}
                            className="bg-muted border border-border text-xs font-bold hover:bg-muted h-8"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                            Ficha
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-48 rounded-xl shadow-lg border-border"
                            >
                              <DropdownMenuItem
                                onClick={() => setClientToAdjust(cliente)}
                                className="cursor-pointer text-xs font-semibold py-2.5"
                              >
                                <PlusCircle className="w-4 h-4 mr-2 text-amber-600" />
                                Cargar saldo inicial
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setClientToEdit(cliente)}
                                className="cursor-pointer text-xs font-semibold py-2.5"
                              >
                                <Edit2 className="w-4 h-4 mr-2 text-blue-600" />
                                Editar datos
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {clientesFiltrados.length > 0 ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
          <p className="text-xs font-medium text-muted-foreground">
            Mostrando {visibleStart}-{visibleEnd} de {clientesFiltrados.length}{" "}
            clientes
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={effectiveCurrentPage === 1}
              className="h-9 text-xs font-bold shadow-none border-border"
            >
              Anterior
            </Button>
            <span className="min-w-20 text-center text-xs font-bold text-muted-foreground">
              {effectiveCurrentPage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={effectiveCurrentPage === totalPages}
              className="h-9 text-xs font-bold shadow-none border-border"
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}

      <ClientDetailSheet
        cliente={selectedClient}
        metodosPago={metodosPago}
        onClose={() => setSelectedClient(null)}
      />
      <EditClientModal
        cliente={clientToEdit}
        onClose={() => setClientToEdit(null)}
      />
      <AdjustClientBalanceModal
        cliente={clientToAdjust}
        onClose={() => setClientToAdjust(null)}
      />
      <ImportClientsCsvModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
      />
    </div>
  );
}
