import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Código VENDORIZADO: entra tal cual desde el registry de bklit
    // (`npx shadcn add @bklit/funnel-chart`) y se actualiza volviéndolo a
    // bajar. Cae en dos reglas de react-hooks que este repo tiene prendidas
    // —`set-state-in-effect` y `refs`— y arreglarlas a mano sería perder el
    // parche en la próxima actualización. No lo mantenemos nosotros.
    "components/charts/**",
  ]),
]);

export default eslintConfig;
