export interface Insight {
  id: string;
  type: "danger" | "warning" | "success" | "info";
  title: string;
  message: string;
  actionLabel?: string;
  href?: string;
  priority: number; // Define el orden de aparición (100 = Máxima urgencia)
}

// Interfaz adaptada a lo que ya retorna tu getDashboardMetrics
export interface AdvisorMetrics {
  ingresos: number;
  ordenes: number;
  unidadesVendidas: number; // <-- Propiedad agregada para corregir el error TS
  gananciaBrutaVentas: number;
  gananciaNeta: number; // Ex Resultado Operativo Estimado
  totalEgresos: number;
  costoPerdidoBajas: number;
  unidadesBajas: number;
  margenPorcentaje: number;
  ticketPromedio: number;
  stockValorizadoCosto: number;
  stockTotalUnidades: number;
  productosCriticos: number;
  productosSinMovimiento: unknown[];
  topProductos: { nombre: string; unidades: number; ganancia: number }[];
  topProductosRentables: {
    nombre: string;
    unidades: number;
    ganancia: number;
  }[];
  peoresProductosRentables?: {
    nombre: string;
    unidades: number;
    ganancia: number;
  }[];
  ventasPorDia: { label: string; value: number }[];
  ventasPorCategoria: {
    label: string;
    ingresos: number;
    unidades: number;
    tickets: number;
  }[];
  /** Opcionales: hoy solo los completa el dashboard principal (que ya trae
   * estos fetches para su columna de Atención Requerida) — /reportes sigue
   * llamando a getAdvisorInsights sin ellos y las reglas de abajo
   * simplemente no se disparan (guardadas con `metrics.x &&`). */
  deudaVencida?: { monto: number; clientes: number };
  remitosPendientes?: { cantidad: number; diasMasAntiguo: number; idMasAntiguo: string };
  categoriaEnRiesgo?: {
    categoria: string;
    unidadesVendidas: number;
    diasCobertura: number;
  };
  finDeTemporada?: {
    frase: string;
    valorizado: number;
  };
  proximaTemporada?: {
    frase: string;
    stockUnidades: number;
  };
}

export function getAdvisorInsights(metrics: AdvisorMetrics): Insight[] {
  const insights: Insight[] = [];

  const formatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

  // --- REGLA DE CONFIANZA (Onboarding) ---
  // Si no hay suficientes datos en el periodo, nos abstenemos de dar consejos erróneos.
  if (metrics.ordenes < 3) {
    return [
      {
        id: "onboarding",
        type: "info",
        priority: 100,
        title: "Recopilando datos...",
        message:
          "El Advisor necesita al menos 3 ventas en este período para analizar el comportamiento de tu negocio y darte recomendaciones precisas.",
      },
    ];
  }

  /* =========================================================================
     1. ALERTAS GRAVES (Action Required) - Prioridad 80 a 100
     ========================================================================= */

  // 1. Margen Operativo Negativo
  if (metrics.margenPorcentaje < 0) {
    insights.push({
      id: "margin_negative",
      type: "danger",
      priority: 100,
      title: "Alerta de Rentabilidad",
      message: `Tu margen operativo está en rojo (${metrics.margenPorcentaje.toFixed(1)}%). Tus gastos superan tus ganancias brutas. Revisa urgente la caja o ajusta tus precios.`,
      actionLabel: "Analizar Caja",
      href: "/caja",
    });
  }

  // 2. Bajas Elevadas (Fuga de capital > 3% de los ingresos o mayor a $20k)
  const porcentajeBajas =
    metrics.ingresos > 0
      ? (metrics.costoPerdidoBajas / metrics.ingresos) * 100
      : 0;
  if (porcentajeBajas > 3 || metrics.costoPerdidoBajas > 20000) {
    insights.push({
      id: "high_shrinkage",
      type: "danger",
      priority: 95,
      title: "Fuga de Capital en Bajas",
      message: `Has perdido ${formatter.format(metrics.costoPerdidoBajas)} en productos dados de baja (${metrics.unidadesBajas} u.). Esto afecta directamente tu bolsillo limpio.`,
      actionLabel: "Ver historial",
      href: "/reportes", // O "/stock/bajas"
    });
  }

  // 3. Egresos Operativos Altos (Si los gastos son más del 40% de la ganancia bruta)
  const proporcionGastos =
    metrics.gananciaBrutaVentas > 0
      ? (metrics.totalEgresos / metrics.gananciaBrutaVentas) * 100
      : 0;
  if (proporcionGastos > 40 && metrics.totalEgresos > 10000) {
    insights.push({
      id: "high_expenses",
      type: "warning",
      priority: 90,
      title: "Egresos Elevados",
      message: `Tus gastos operativos consumen el ${proporcionGastos.toFixed(0)}% de tu ganancia bruta. Audita en qué se está yendo el efectivo físico.`,
      actionLabel: "Revisar Caja",
      href: "/caja",
    });
  }

  // 4. Stock Crítico — solo productos/variantes que ADEMÁS tuvieron ventas
  // recientes (ver detectar-quiebres.ts): contar todo el catálogo con
  // stock ≤3 disparaba con ~90% de los productos en indumentaria.
  if (metrics.productosCriticos > 0) {
    insights.push({
      id: "stock_critical",
      type: "danger",
      priority: 85,
      title: "Riesgo de Quiebre",
      message: `Tienes ${metrics.productosCriticos} productos/variantes que están rotando y con stock crítico (≤ 3 unidades). Podrías estar perdiendo ventas por falta de mercadería.`,
      actionLabel: "Reponer Stock",
      href: "/stock",
    });
  }

  // 4c. Riesgo por categoría: alta rotación reciente + stock total
  // agotándose (ver detectar-riesgo-categoria.ts). Complementa la regla
  // anterior, que mira producto por producto — esta mira la categoría
  // completa aunque ningún producto individual esté todavía en ≤3.
  if (metrics.categoriaEnRiesgo) {
    const diasRestantes = Math.max(
      1,
      Math.round(metrics.categoriaEnRiesgo.diasCobertura),
    );
    insights.push({
      id: "categoria_riesgo_stock",
      type: "warning",
      priority: 80,
      title: "Categoría en Riesgo de Stock",
      message: `Estás vendiendo mucho en ${metrics.categoriaEnRiesgo.categoria} y te estás quedando con poco stock (quedan ~${diasRestantes} día${diasRestantes === 1 ? "" : "s"} al ritmo actual) — reponé antes de perder ventas.`,
      actionLabel: "Ver stock",
      href: "/stock",
    });
  }

  // 4b. Deuda Vencida Cobrable (reusa clientes.saldo_pendiente +
  // fecha_vencimiento_deuda, el mismo caché que ya mantiene manage-clients.ts
  // vía calcularDiasVencido — ver get-deuda-vencida.ts).
  // Umbral: grave si la deuda vencida supera el 50% de los ingresos del
  // período (compromete la próxima reposición) o supera $50k en términos
  // absolutos aunque el período haya facturado mucho; si no, advertencia.
  if (metrics.deudaVencida && metrics.deudaVencida.monto > 0) {
    const proporcionDeuda =
      metrics.ingresos > 0
        ? (metrics.deudaVencida.monto / metrics.ingresos) * 100
        : 100;
    const esGrave = proporcionDeuda > 50 || metrics.deudaVencida.monto > 50000;
    insights.push({
      id: "deuda_vencida",
      type: esGrave ? "danger" : "warning",
      priority: esGrave ? 92 : 72,
      title: "Deuda Vencida",
      message: `Tenés ${formatter.format(metrics.deudaVencida.monto)} en deuda vencida de ${metrics.deudaVencida.clientes} cliente${metrics.deudaVencida.clientes === 1 ? "" : "s"}. Es plata tuya que ya deberías haber cobrado.`,
      actionLabel: "Ver clientes",
      href: "/clientes",
    });
  }

  /* =========================================================================
     2. ADVERTENCIAS OPERATIVAS - Prioridad 50 a 79
     ========================================================================= */

  // 5. Capital Inmovilizado Alto (Si hay mucha plata frenada sin venderse)
  // Definimos "Alto" si el stock valorizado es 5 veces mayor a los ingresos del periodo
  if (
    metrics.ingresos > 0 &&
    metrics.stockValorizadoCosto > metrics.ingresos * 5
  ) {
    insights.push({
      id: "capital_stuck",
      type: "warning",
      priority: 75,
      title: "Capital Inmovilizado",
      message: `Tienes ${formatter.format(metrics.stockValorizadoCosto)} frenados en stock. Hay mucha mercadería y poca rotación en este período.`,
    });
  }

  // 6. Mucha rotación concentrada en pocos productos (Dependencia)
  if (metrics.topProductos.length > 0) {
    const ventasDelTop1 = metrics.topProductos[0]?.unidades || 0;
    if (ventasDelTop1 > metrics.unidadesVendidas * 0.4) {
      // El top 1 representa el 40% del total
      insights.push({
        id: "high_dependency",
        type: "warning",
        priority: 70,
        title: "Dependencia de Catálogo",
        message: `El 40% de tu volumen de ventas depende exclusivamente de "${metrics.topProductos[0].nombre}". Intenta promocionar otras categorías para diversificar el riesgo.`,
      });
    }
  }

  // 7. Productos con stock pero sin movimiento
  if (metrics.productosSinMovimiento.length > 3) {
    insights.push({
      id: "no_movement",
      type: "warning",
      priority: 65,
      title: "Inventario Estancado",
      message: `Tienes ${metrics.productosSinMovimiento.length} productos con stock que no registran ventas. Considera armar un combo o descuento temporal para liquidarlos.`,
    });
  }

  // 7b. Remitos Pendientes de Conciliar (prioridad media: no es plata
  // perdida como la deuda o las bajas, pero mientras no se concilien el
  // costo/stock de esos productos puede estar desactualizado).
  if (metrics.remitosPendientes && metrics.remitosPendientes.cantidad > 0) {
    insights.push({
      id: "remitos_pendientes",
      type: "warning",
      priority: 58,
      title: "Remitos sin Conciliar",
      message: `Tenés ${metrics.remitosPendientes.cantidad} remito${metrics.remitosPendientes.cantidad === 1 ? "" : "s"} sin conciliar — el más antiguo hace ${metrics.remitosPendientes.diasMasAntiguo} día${metrics.remitosPendientes.diasMasAntiguo === 1 ? "" : "s"}. El costo y stock real de esos productos puede no estar actualizado hasta que los revises.`,
      actionLabel: "Conciliar",
      href: `/compras/merge/${metrics.remitosPendientes.idMasAntiguo}`,
    });
  }

  // 7c. Fin de temporada (invierno/verano) con stock remanente sin
  // rotación — ver detectar-estacionalidad.ts. Calendario hardcodeado
  // (Argentina), sin forecasting: son rangos de fecha conocidos.
  if (metrics.finDeTemporada) {
    insights.push({
      id: "fin_de_temporada",
      type: "warning",
      priority: 68,
      title: "Fin de Temporada",
      message: `${metrics.finDeTemporada.frase} y tenés ${formatter.format(metrics.finDeTemporada.valorizado)} en esa categoría con poca rotación — considerá una liquidación.`,
      actionLabel: "Ver stock",
      href: "/stock",
    });
  }

  /* =========================================================================
     3. OPORTUNIDADES COMERCIALES - Prioridad 30 a 49
     ========================================================================= */

  // 7d. Se acerca una temporada (incluidas las fiestas) y el stock de sus
  // categorías típicas está bajo — oportunidad de reponer a tiempo, no un
  // problema todavía (por eso vive en la sección de oportunidades y no en
  // advertencias).
  if (metrics.proximaTemporada) {
    insights.push({
      id: "proxima_temporada",
      type: "info",
      priority: 42,
      title: "Reposición de Temporada",
      message: `${metrics.proximaTemporada.frase} y tu stock de esa categoría está bajo — es buen momento para reponer.`,
      actionLabel: "Ver stock",
      href: "/stock",
    });
  }

  // 8. Oportunidad de Upselling (Si el ticket es bajo en un negocio con muchas ventas)
  if (
    metrics.ticketPromedio > 0 &&
    metrics.ticketPromedio < 5000 &&
    metrics.ordenes > 10
  ) {
    insights.push({
      id: "upselling",
      type: "info",
      priority: 45,
      title: "Oportunidad de Upselling",
      message: `Tu ticket promedio está en ${formatter.format(metrics.ticketPromedio)}. Si le ofreces un accesorio barato a cada cliente en el mostrador para subir este ticket solo un 15%, tus ganancias crecerán sin necesitar clientes nuevos.`,
    });
  }

  // 9. Producto Estrella con rentabilidad destacada
  if (
    metrics.topProductosRentables.length > 0 &&
    metrics.topProductosRentables[0].ganancia > 0
  ) {
    const top = metrics.topProductosRentables[0];
    insights.push({
      id: "top_profitable",
      type: "success",
      priority: 40,
      title: "Producto Estrella",
      message: `"${top.nombre}" es tu producto más rentable (te dejó +${formatter.format(top.ganancia)} limpios). Dale prioridad en el escaparate o publícalo más seguido.`,
    });
  }

  // 10. Día fuerte de ventas
  if (metrics.ventasPorDia && metrics.ventasPorDia.length > 0) {
    const bestDay = metrics.ventasPorDia[0];
    if (bestDay.value > metrics.ingresos * 0.3) {
      // Representa el 30% de los ingresos
      insights.push({
        id: "best_day",
        type: "info",
        priority: 35,
        title: `Día Pico: ${bestDay.label}`,
        message: `Históricamente, los ${bestDay.label}s concentran tu mayor volumen de facturación. Asegura personal, stock y cambio en la caja desde la mañana.`,
      });
    }
  }

  /* =========================================================================
     4. FELICITACIONES (Señales Positivas) - Prioridad 1 a 29
     ========================================================================= */

  // Solo felicitamos si NO hay alertas graves o advertencias, para no "tapar" el fuego con confeti.
  const hasCriticalWarnings = insights.some(
    (i) => i.type === "danger" || i.type === "warning",
  );

  if (!hasCriticalWarnings) {
    if (metrics.margenPorcentaje > 30) {
      insights.push({
        id: "good_margin",
        type: "success",
        priority: 20,
        title: "Rentabilidad Saludable",
        message: `¡Excelente trabajo! Tu margen operativo está muy sano (${metrics.margenPorcentaje.toFixed(1)}%). Estás controlando muy bien tus gastos.`,
      });
    }

    if (porcentajeBajas === 0) {
      insights.push({
        id: "no_shrinkage",
        type: "success",
        priority: 15,
        title: "Inventario Perfecto",
        message:
          "No registras pérdidas por bajas ni bajas en este período. ¡Sigue cuidando así la mercadería!",
      });
    }
  }

  // --- FILTRADO FINAL ---
  // Ordenamos de mayor prioridad a menor, y cortamos el array para que el dueño
  // solo lea los 3 consejos MÁS importantes, evitando la fatiga de información.
  return insights.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
