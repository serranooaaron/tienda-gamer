# Cómo se trabaja en este repositorio

## Ramas

`main` siempre está publicada: cada cambio que entra se despliega solo en Render. Por eso nada se sube directo a `main`. Cada cambio va en su propia rama, creada desde `main` al día, y entra por pull request.

| Prefijo | Para | Ejemplo |
|---|---|---|
| `feature/` | Funcionalidad nueva | `feature/filtros-catalogo` |
| `fix/` | Corrección de un error | `fix/stock-negativo-en-checkout` |
| `security/` | Endurecimiento de seguridad | `security/revocar-sesiones` |
| `refactor/` | Reorganizar código sin cambiar lo que hace | `refactor/rutas-de-productos` |
| `docs/` | Solo documentación | `docs/readme-deploy` |
| `ci/` | Tests automáticos y GitHub Actions | `ci/tests-en-pull-requests` |
| `chore/` | Mantenimiento (dependencias, configuración) | `chore/actualizar-mongoose` |

El nombre dice qué cambia, en minúsculas y con guiones.

## Pull requests

1. Subir la rama y abrir el PR contra `main`. La plantilla pide:
   - qué cambia;
   - cómo funciona;
   - cómo se probó;
   - qué no se verificó;
   - qué hacer después de unir.
2. El chequeo **Tests y dependencias** (GitHub Actions) corre la suite completa y `npm audit`. El PR se une solo con el chequeo en verde.
3. Al unir, Render publica la versión nueva. Hay que revisar `/api/health` y lo que cambió.
4. Después de unir, borrar la rama en GitHub y en local.

## Commits

- Título corto en imperativo y en español ("Sumar filtros por marca al catálogo").
- Debajo, viñetas con lo que cambia para quien usa la tienda.
- La explicación técnica de cada funcionalidad va en [docs/DESARROLLO.md](docs/DESARROLLO.md).

## Antes de abrir el PR

```bash
npm test                  # suite completa sobre MongoDB en memoria
npm audit --omit=dev      # sin vulnerabilidades altas ni críticas
npm run dev:memory        # recorrido manual sin tocar la base real
```

El hook de pre-commit (ggshield) frena los commits que contienen secretos. No se salta con `--no-verify`.
