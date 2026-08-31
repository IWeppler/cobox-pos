import { slugify } from "@/shared/utils/slugify";

type AtributoRequerido = { nombre: string; requerido: boolean };

/**
 * Los atributos requeridos que faltan, escritos como se los nombra en pantalla.
 *
 * `missingRequiredAttributes` viaja en SLUGS —así se compara "Género" con
 * "genero" sin depender de cómo lo tipearon— y un slug no se le puede mostrar
 * a nadie. Acá se traducen contra los nombres que declara la categoría.
 *
 * Existe porque el mensaje de bloqueo decía "uno o más atributos requeridos",
 * que es verdadero y no sirve: quien lo lee no sabe qué completar. Cuando la
 * traducción falla —un slug sin nombre conocido— se cae a esa frase genérica
 * en vez de mostrar el slug crudo.
 */
export function textoAtributosFaltantes(
  atributosRequeridos: AtributoRequerido[],
  faltantes: Set<string>,
): string {
  const porSlug = new Map(
    atributosRequeridos
      .filter((a) => a.requerido)
      .map((a) => [slugify(a.nombre), a.nombre]),
  );

  const nombres = [...faltantes]
    .map((slug) => porSlug.get(slug))
    .filter((nombre): nombre is string => Boolean(nombre));

  if (nombres.length === 0) return "los atributos requeridos";
  if (nombres.length === 1) return nombres[0];

  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}
