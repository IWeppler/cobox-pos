import {
  buildVariantKey,
  normalizeKeyPart,
} from "../utils/parse-legacy-variant";

/**
 * Agregar o quitar una propiedad de la grilla (por ejemplo sumarle "Género"
 * a un producto que tenía Talle y Color) cambia la key de TODAS las
 * combinaciones, aunque la mercadería sea exactamente la misma. Para el diff
 * de guardado eso se ve como "se eliminan todas y se crean otras tantas": una
 * lista larga de borrados que se lee como ruido de la reorganización y se
 * autoriza sin mirar. Así se perdieron 11 pares de zapatillas en Evens el
 * 1/9/2026 — el stock viajaba a variantes nuevas que nacían en cero.
 *
 * Este módulo empareja los dos lados por las propiedades que están en AMBOS:
 * si la combinación coincide en todas ellas, no es un borrado sino un
 * renombre, y su stock tiene que viajar a la fila nueva.
 */

type VarianteConValores = {
  key: string;
  valores: Record<string, string>;
};

/** Nombres de propiedad (normalizados) presentes en las dos puntas. */
export function propiedadesComunes(
  atributosEnBase: Array<Record<string, string>>,
  variantesDelForm: Array<Record<string, string>>,
): Set<string> {
  const enBase = new Set(
    atributosEnBase.flatMap((a) => Object.keys(a).map(normalizeKeyPart)),
  );
  const enForm = new Set(
    variantesDelForm.flatMap((v) => Object.keys(v).map(normalizeKeyPart)),
  );
  return new Set([...enBase].filter((prop) => enForm.has(prop)));
}

/**
 * ¿El guardado cambia el esquema de atributos? Con las mismas propiedades de
 * los dos lados no hay nada que emparejar: la key normal ya alcanza.
 */
export function cambiaElEsquema(
  atributosEnBase: Array<Record<string, string>>,
  variantesDelForm: Array<Record<string, string>>,
): boolean {
  const enBase = new Set(
    atributosEnBase.flatMap((a) => Object.keys(a).map(normalizeKeyPart)),
  );
  const enForm = new Set(
    variantesDelForm.flatMap((v) => Object.keys(v).map(normalizeKeyPart)),
  );
  const comunes = propiedadesComunes(atributosEnBase, variantesDelForm);

  return (
    comunes.size > 0 && (enBase.size !== comunes.size || enForm.size !== comunes.size)
  );
}

/** Key armada solo con las propiedades presentes en ambos lados. */
export function keyPorPropiedadesComunes(
  valores: Record<string, string>,
  comunes: Set<string>,
): string {
  return buildVariantKey(
    Object.fromEntries(
      Object.entries(valores).filter(([prop]) =>
        comunes.has(normalizeKeyPart(prop)),
      ),
    ),
  );
}

/**
 * Devuelve, para cada variante de base que no tiene par exacto en el
 * payload, la key de la variante del form que la continúa.
 *
 * Resultado: `Map<keyDeBase, keyDelForm>`.
 *
 * Solo se emparejan combinaciones sin par exacto: una variante que ya
 * coincide key a key no está renombrándose. Y las keys reducidas que quedan
 * repetidas de cualquiera de los dos lados se descartan: al QUITAR una
 * propiedad, dos combinaciones distintas pueden colapsar en la misma key
 * (Marrón/35/Hombre y Marrón/35/Mujer), y ahí no hay forma de saber cuál
 * hereda el stock. Ese caso vuelve a tratarse como eliminación, que es el
 * lado seguro: el usuario la confirma a mano.
 */
export function emparejarPorEsquema(
  variantesEnBase: VarianteConValores[],
  variantesDelForm: VarianteConValores[],
): Map<string, string> {
  const comunes = propiedadesComunes(
    variantesEnBase.map((v) => v.valores),
    variantesDelForm.map((v) => v.valores),
  );

  if (
    !cambiaElEsquema(
      variantesEnBase.map((v) => v.valores),
      variantesDelForm.map((v) => v.valores),
    )
  ) {
    return new Map();
  }

  const keysEnBase = new Set(variantesEnBase.map((v) => v.key));
  const keysDelForm = new Set(variantesDelForm.map((v) => v.key));

  const indexar = (
    variantes: VarianteConValores[],
    tieneParExacto: (key: string) => boolean,
  ) => {
    const porKeyComun = new Map<string, string>();
    const ambiguas = new Set<string>();

    for (const variante of variantes) {
      if (tieneParExacto(variante.key)) continue;
      const reducida = keyPorPropiedadesComunes(variante.valores, comunes);
      if (!reducida) continue;
      if (porKeyComun.has(reducida)) {
        ambiguas.add(reducida);
        continue;
      }
      porKeyComun.set(reducida, variante.key);
    }

    for (const key of ambiguas) porKeyComun.delete(key);
    return porKeyComun;
  };

  const destinos = indexar(variantesDelForm, (key) => keysEnBase.has(key));
  const origenes = indexar(variantesEnBase, (key) => keysDelForm.has(key));

  const renombres = new Map<string, string>();
  for (const [reducida, keyBase] of origenes) {
    const keyForm = destinos.get(reducida);
    if (keyForm) renombres.set(keyBase, keyForm);
  }

  return renombres;
}
