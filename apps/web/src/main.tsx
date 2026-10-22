import { createRootRoute, createRoute, createRouter, lazyRouteComponent, RouterProvider } from "@tanstack/react-router";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Layout } from "./components/layout.tsx";
import { RouteError, RouteNotFound } from "./components/route-states.tsx";
import { loadData } from "./lib.ts";
import "./styles.css";
import type {
  AgencyDetail,
  AgencySummary,
  BulletinDetail,
  BulletinIndex,
  Catalog,
  ComprasSummary,
  NotPublished,
  SignalsTopic,
  SupplierDetail,
  SupplierSummary,
} from "./types.ts";

// Each page is its own chunk: the first visit downloads only the layout and the page it lands on.
const page = <K extends string>(load: () => Promise<Record<K, () => ReactNode>>, name: K) => lazyRouteComponent(load, name);

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: RouteNotFound });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async () => {
    const [compras, senales, catalogo] = await Promise.all([
      loadData<ComprasSummary>("compras/resumen.json").catch(() => null),
      loadData<SignalsTopic>("senales.json").catch(() => null),
      loadData<Catalog>("catalogo.json"),
    ]);
    return { compras, senales, catalogo };
  },
  component: page(() => import("./pages/home.tsx"), "HomePage"),
});

const comprasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/compras",
  loader: () => loadData<ComprasSummary>("compras/resumen.json"),
  component: page(() => import("./pages/compras.tsx"), "ComprasPage"),
});

const organismosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organismos",
  loader: async () => {
    const [organismos, resumen] = await Promise.all([
      loadData<AgencySummary[]>("compras/organismos.json"),
      loadData<ComprasSummary>("compras/resumen.json"),
    ]);
    return { organismos, resumen };
  },
  component: page(() => import("./pages/organismos.tsx"), "OrganismosPage"),
});

const organismoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organismos/$id",
  loader: ({ params }) => loadData<AgencyDetail>(`compras/organismos/${encodeURIComponent(params.id)}.json`),
  component: page(() => import("./pages/organismos.tsx"), "OrganismoPage"),
});

const proveedoresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proveedores",
  loader: async () => {
    const [proveedores, resumen] = await Promise.all([
      loadData<SupplierSummary[]>("compras/proveedores.json"),
      loadData<ComprasSummary>("compras/resumen.json"),
    ]);
    return { proveedores, resumen };
  },
  component: page(() => import("./pages/proveedores.tsx"), "ProveedoresPage"),
});

const proveedorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/proveedores/$cuit",
  // Only CUITs of companies have a page: anything else is a 404 without asking the server.
  loader: ({ params }) => loadData<SupplierDetail>(`compras/proveedores/${/^3\d{10}$/.test(params.cuit) ? params.cuit : "-"}.json`),
  component: page(() => import("./pages/proveedores.tsx"), "ProveedorPage"),
});

const senalesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/senales",
  loader: () => loadData<SignalsTopic>("senales.json"),
  component: page(() => import("./pages/senales.tsx"), "SenalesPage"),
});

const boletinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boletin",
  loader: () => loadData<BulletinIndex>("boletin/indice.json"),
  component: page(() => import("./pages/boletin.tsx"), "BoletinPage"),
});

const boletinDetalleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boletin/$numero",
  loader: ({ params }) => loadData<BulletinDetail>(`boletin/${/^\d+$/.test(params.numero) ? params.numero : "-"}.json`),
  component: page(() => import("./pages/boletin.tsx"), "BoletinDetallePage"),
});

const fuentesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fuentes",
  loader: () => loadData<Catalog>("catalogo.json"),
  component: page(() => import("./pages/fuentes.tsx"), "FuentesPage"),
});

const datosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/datos",
  loader: () => loadData<Catalog>("catalogo.json"),
  component: page(() => import("./pages/fuentes.tsx"), "DatosPage"),
});

const noPublicadoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/no-publicado",
  loader: () => loadData<NotPublished[]>("no-publicado.json"),
  component: page(() => import("./pages/no-publicado.tsx"), "NoPublicadoPage"),
});

const comoLeerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/como-leer",
  component: page(() => import("./pages/como-leer.tsx"), "ComoLeerPage"),
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  comprasRoute,
  organismosRoute,
  organismoRoute,
  proveedoresRoute,
  proveedorRoute,
  senalesRoute,
  boletinRoute,
  boletinDetalleRoute,
  fuentesRoute,
  datosRoute,
  noPublicadoRoute,
  comoLeerRoute,
]);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
