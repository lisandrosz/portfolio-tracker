# Portfolio Tracker

App personal para llevar el seguimiento de tus inversiones. Trackea crypto, CEDEARs, plazo fijo, cash y mas.

## Instalacion

```bash
git clone https://github.com/TU_USUARIO/portfolio-tracker.git
cd portfolio-tracker
npm install
npm run dev
```

Abri **http://localhost:3000** en tu navegador.

## Como usar

### 1. Agregar activos

Ve a **Activos** > **Agregar Activo** y completa:

- **Nombre y Simbolo** (ej: Bitcoin / BTC)
- **Tipo**: Crypto, CEDEAR, Plazo Fijo, Cash USD, Cash ARS u Otro
- **Cantidad**: cuanto tenes
- **Fecha**: cuando lo compraste
- **Precio**: se autocompleta para crypto segun la fecha

Si agregas el mismo activo varias veces (ej: BTC comprado en distintas fechas), se agrupa automaticamente en una sola fila con el costo promedio calculado.

### 2. Actualizar precios

- **Crypto**: click en **Actualizar Precios** (busca precios en tiempo real de CoinGecko)
- **Otros activos**: click en el icono de lapiz y actualiza el precio manualmente

### 3. Registrar movimientos

Ve a **Transacciones** > **Nueva Transaccion**:

| Tipo | Cuando usarlo |
|------|--------------|
| Compra | Compraste crypto, cedears, etc |
| Venta | Vendiste algo |
| Deposito | Ingresaste plata nueva |
| Retiro | Sacaste plata |
| Interes | Ganancia de plazo fijo, staking |
| Dividendo | Cobro de dividendos |

### 4. Tomar snapshots

En el **Dashboard** click en **Snapshot** una vez por mes. Esto guarda el valor del portfolio para los graficos de evolucion.

### 5. Ver analytics

En **Analytics** podes ver:
- Evolucion del portfolio en el tiempo
- Ganancias y perdidas por periodo
- Distribucion por tipo de activo

Usa los filtros **1M / 3M / 6M / 1Y / Todo** para ver distintos periodos.

## Stack

- **Next.js 16** + TypeScript
- **Tailwind CSS** + shadcn/ui
- **SQLite** (datos locales, no necesita servidor de DB)
- **Recharts** para graficos
- **CoinGecko API** para precios crypto (gratis)

## Datos

Todos los datos se guardan localmente en `data/portfolio.db`. No se comparten ni se suben a ningun servidor. Si cerras la app, los datos persisten.
