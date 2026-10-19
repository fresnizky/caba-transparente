# Ramas y PR

Se trabaja como un equipo aunque haya una sola persona (decisión D-13).

## Ramas

- `main` es la única rama permanente y está protegida: no se pushea directo, todo entra por PR con la CI en verde.
- Cada cambio sale de `main` en su propia rama: `<tipo>/<descripcion-corta>` (por ejemplo `feat/compras-bac`, `fix/boletin-fechas`, `docs/decisiones-iniciales`).
- Una rama, un tema. Si un cambio necesita otro antes, se abre primero el PR del que va abajo.
- Excepción: los commits automáticos de datos (`chore(data): …`) los hace el workflow de actualización directo en `main`.

## Mensajes de commit y títulos de PR

[Conventional Commits](https://www.conventionalcommits.org/es/): tipo y ámbito en inglés, descripción en español, en minúscula y sin punto final.

```
feat(scrapers): compras de Buenos Aires Compras (2014 a 2026)
fix(core): el manifest no se recargaba entre fuentes
docs: decisiones de almacenamiento y hosting
```

Tipos: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`. El título del PR sigue el mismo formato, porque se usa como mensaje del commit al hacer squash.

## PR

- Se usa la plantilla (`.github/pull_request_template.md`): qué cambia, por qué, cómo se verificó y qué datos toca.
- La CI (`.github/workflows/ci.yml`) corre tipos, lint y pruebas. Sin CI en verde no se mergea.
- Se mergea con **squash**: un PR, un commit en `main`.
- Cuando haya más de una persona, cada PR necesita la aprobación de alguien que no lo escribió. Mientras tanto, quien lo abre lo revisa y lo mergea.
- Los agentes de IA abren PR pero **no mergean** salvo que se les pida explícitamente para ese PR.

## Antes de pedir revisión

```bash
bun run typecheck
bun run lint
bun test
```

Y buscar que no se haya colado nada que no corresponde publicar: datos personales, claves, archivos de `data/raw` que no sean manifests.
