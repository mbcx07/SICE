# 🏗️ REFACTOR PLAN — SICE App.tsx

> Plan de división de `App.tsx` (~1600 líneas) en componentes modulares, hooks y utilidades.
> No se modifica código existente. Solo planificación arquitectónica.

---

## 📊 Diagnóstico Actual

`App.tsx` es un **monolito** que contiene:

| Sección           | Líneas aproximadas | Problema                                      |
| ----------------- | ------------------ | --------------------------------------------- |
| Auth / Login      | ~100               | Mezclado con UI principal                     |
| Dashboard         | ~350               | KPIs, gráficas, cobranza, proveedor, envíos   |
| Patients          | ~180               | Lista + formulario + detección duplicados      |
| Sales             | ~350               | Lista + formulario venta + catálogo completo   |
| Payments (modal)  | ~130               | Múltiples pagos por venta                     |
| Appointments      | ~120               | Agenda semanal + formulario cita              |
| Intakes           | ~130               | Registro público + admin (aprobar/rechazar)   |
| Settings          | ~100               | Branding + Calendar + Cuenta                  |
| Print             | ~60                | Nota de venta imprimible                      |
| Utilidades        | ~40                | `formatCurrency`, semanas, fileToDataUrl      |
| Hooks/State       | ~80                | 25+ states, 10+ useMemo/useEffect             |

---

## 🧱 Nueva Estructura de Componentes

```
sice/
├── App.tsx                        ← Mínimo: auth gate + tabs + error boundary
│
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx             ← Header con logo, usuario, logout
│   │   ├── TabNav.tsx             ← Navegación de pestañas
│   │   └── Toast.tsx              ← Mensaje flotante (uiMessage)
│   │
│   ├── auth/
│   │   ├── LoginForm.tsx          ← Formulario matrícula + password
│   │   └── ChangePasswordModal.tsx ← Modal cambiar contraseña
│   │
│   ├── dashboard/
│   │   ├── DashboardTab.tsx       ← Contenedor de tablero
│   │   ├── DashboardFilters.tsx   ← Presets (quincena/mes/año/rango)
│   │   ├── DashboardKPIs.tsx      ← Tarjetas de KPIs (ventas, costo, IVA, ganancia)
│   │   ├── DashboardChart.tsx     ← Gráfica Recharts (ventas/ganancia por mes/quincena/día)
│   │   ├── ProviderPending.tsx    ← Pendiente proveedor
│   │   ├── CollectionPanel.tsx    ← Panel de cobranza
│   │   ├── DeliveredPanel.tsx     ← Plantillas entregadas
│   │   ├── RenewalsPanel.tsx      ← Renovaciones próximo mes
│   │   ├── ProviderMonthly.tsx    ← Resumen mensual proveedor
│   │   └── ProviderShipmentsPanel.tsx ← Envíos proveedor
│   │
│   ├── patients/
│   │   ├── PatientsTab.tsx        ← Contenedor pacientes
│   │   ├── PatientList.tsx        ← Lista filtrable con búsqueda
│   │   ├── PatientForm.tsx        ← Formulario crear/editar
│   │   ├── PatientHistory.tsx     ← Histórico de ventas del paciente
│   │   └── DuplicateDetector.tsx  ← Detección de duplicados por email
│   │
│   ├── sales/
│   │   ├── SalesTab.tsx           ← Contenedor ventas
│   │   ├── SaleList.tsx           ← Lista de ventas del año
│   │   ├── SaleForm.tsx           ← Formulario nueva venta
│   │   ├── SaleLineItemRow.tsx    ← Fila de concepto (catálogo/manual)
│   │   ├── SalePreview.tsx        ← Resumen subtotal/IVA/total/utilidad
│   │   ├── CatalogPanel.tsx       ← Gestión de catálogo (incrustado en ventas)
│   │   ├── CatalogItemRow.tsx     ← Fila de item en catálogo
│   │   └── CatalogForm.tsx        ← Formulario crear/editar ítem
│   │
│   ├── payments/
│   │   ├── PaymentsModal.tsx      ← Modal de cobros múltiples
│   │   └── PaymentForm.tsx        ← Formulario agregar/editar pago
│   │
│   ├── appointments/
│   │   ├── AppointmentsTab.tsx    ← Contenedor agenda
│   │   ├── AppointmentList.tsx    ← Lista semanal con navegación ← →
│   │   └── AppointmentForm.tsx    ← Formulario crear/editar cita
│   │
│   ├── intakes/
│   │   ├── IntakesTab.tsx         ← Contenedor registros (admin)
│   │   ├── IntakeList.tsx         ← Lista con filtros y acciones
│   │   ├── IntakeEditModal.tsx    ← Modal editar registro
│   │   └── PublicRegister.tsx     ← Formulario público (sin auth)
│   │
│   ├── settings/
│   │   ├── SettingsTab.tsx        ← Contenedor ajustes
│   │   ├── BrandingPanel.tsx      ← Color + logo
│   │   ├── CalendarPanel.tsx      ← Webhook Google Calendar
│   │   └── AccountPanel.tsx       ← Info cuenta + cambiar contraseña
│   │
│   ├── print/
│   │   └── SalePrintNote.tsx      ← Nota de venta imprimible (área oculta)
│   │
│   └── shared/
│       ├── Modal.tsx              ← Overlay + card genérico reutilizable
│       ├── SummaryBox.tsx         ← Caja de resumen (totales)
│       ├── StatCard.tsx           ← Tarjeta de estadística
│       └── EmptyState.tsx         ← Estado vacío ("Sin datos")
```

---

## 🪝 Custom Hooks a Extraer

| Hook                     | Origen             | Responsabilidad                                    |
| ------------------------ | ------------------ | -------------------------------------------------- |
| `useAuth()`              | App.tsx            | Login, logout, ensureSession, changePassword       |
| `useSiceSettings()`      | App.tsx            | Watch settings, theme color, logo                  |
| `useDashboard()`         | App.tsx            | Presets, rango, KPIs, chart data, filtros          |
| `usePatients()`          | App.tsx            | CRUD patients, búsqueda, duplicados                |
| `useSales()`             | App.tsx            | CRUD sales, vista previa, items                    |
| `usePayments()`          | App.tsx            | Pagos múltiples por venta, MP fee                  |
| `useAppointments()`      | App.tsx            | Agenda semanal, navegación, CRUD citas             |
| `useIntakes()`           | App.tsx            | Registros, aprobar/rechazar, crear paciente        |
| `useCatalog()`           | App.tsx            | CRUD catálogo, seeds templates                     |
| `useProviderShipments()` | App.tsx            | CRUD envíos proveedor                              |
| `useCalendarWebhook()`   | App.tsx            | Llamadas a Google Apps Script                      |

---

## 🧩 Utilidades a Extraer

```
utils/
├── format.ts               ← formatCurrency, clampColor
├── date.ts                 ← startOfWeekIso, endOfWeekIso, addMonthsIso
├── file.ts                 ← fileToDataUrl
└── finance.ts              ← salePaidTotal, salePendingTotal, saleMpFeeTotal, SALE_MP_FEE_RATE
```

---

## 📦 Props / Contratos de Datos

### `App.tsx` (reducido)
```tsx
const App: React.FC = () => {
  const { user, loading, error, login, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginForm onLogin={login} error={error} />;

  return (
    <div className="appShell">
      <SalePrintNote ref={printRef} sale={printTarget} logo={logo} />
      <PaymentsModal ... />
      <TopBar user={user} onLogout={logout} logo={logo} />
      <TabNav tab={tab} onTabChange={setTab} />
      <Toast message={uiMessage} />
      <main className="content">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'patients' && <PatientsTab />}
        {tab === 'sales' && <SalesTab />}
        {tab === 'appointments' && <AppointmentsTab />}
        {tab === 'intakes' && <IntakesTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
};
```

---

## 🔄 Plan de Migración (Fases)

### Fase 0 — Seguridad (no tocar funcionalidad)
- Crear tests de humo para cada tab
- Backup del código actual

### Fase 1 — Utilidades y Tipos
1. Extraer `utils/format.ts` ← `formatCurrency`, `clampColor`
2. Extraer `utils/date.ts` ← `startOfWeekIso`, `endOfWeekIso`, `addMonthsIso`
3. Extraer `utils/file.ts` ← `fileToDataUrl`
4. Extraer `constants.ts` ← `SALE_MP_FEE_RATE`, `DEFAULT_IVA_RATE`

### Fase 2 — Hooks
5. `useSiceSettings()` — settings + theme CSS var + logo
6. `usePatients()` — CRUD + búsqueda + duplicados
7. `useCatalog()` — CRUD + seeds
8. `useSales()` — CRUD + preview
9. `usePayments()` — pagos múltiples + MP fee
10. `useAppointments()` — agenda semanal + navegación
11. `useIntakes()` — registros públicos + admin
12. `useProviderShipments()` — envíos proveedor
13. `useCalendarWebhook()` — webhook calls

### Fase 3 — Componentes (bottom-up)
14. `shared/` — Modal, StatCard, SummaryBox, EmptyState
15. `layout/` — TopBar, TabNav, Toast
16. `auth/` — LoginForm, ChangePasswordModal
17. `print/` — SalePrintNote
18. `payments/` — PaymentsModal, PaymentForm
19. Cada tab por separado (un PR por tab para revisión segura):
    - `dashboard/` → Panel de control
    - `patients/` → Gestión pacientes
    - `sales/` → Ventas + catálogo
    - `appointments/` → Agenda
    - `intakes/` → Registros
    - `settings/` → Configuración

### Fase 4 — Integración final
20. Reescribir `App.tsx` como shell ligero
21. Verificar que todas las interacciones cross-tab funcionen
    - Crear venta y ver reflejado en dashboard
    - Aprobar intake y ver paciente creado
    - Agregar cita y ver en agenda

---

## ⚠️ Puntos de Riesgo

1. **Estado compartido entre tabs**: Ventas afecta dashboard, intakes afecta pacientes. Los hooks deben consumir los mismos streams de Firestore o usar un context/state manager.

2. **Ciclo de vida de suscripciones**: Los `onSnapshot` deben limpiarse correctamente al cambiar de tab o desmontar componentes.

3. **Template seeds**: La lógica de `seededCatalogTemplatesRef` debe correr una sola vez. Al mover a `useCatalog`, asegurar que no se re-ejecute.

4. **Print**: `window.print()` usa CSS `@media print`, que oculta todo excepto `.printArea`. Debe seguir funcionando después del refactor.

5. **Modal de pagos**: Se refresca desde el stream de sales (`useEffect` dependiente de `sales`). Mantener esta relación.

6. **Webhook errors**: No deben bloquear el flujo principal (venta/cita se guardan aunque falle el calendar).

---

## 📏 Métricas Objetivo

| Archivo           | Actual     | Objetivo     |
| ----------------- | ---------- | ------------ |
| `App.tsx`         | ~1600 loc  | ~80 loc      |
| Por componente    | N/A        | ≤200 loc     |
| Por hook          | N/A        | ≤100 loc     |
| Componentes total | 1          | ~35          |
| Hooks total       | 0          | ~11          |

---

## 🏁 Criterios de Done

- [ ] App.tsx < 100 líneas (solo routing + providers)
- [ ] Cada tab funciona en aislamiento
- [ ] Las suscripciones Firestore se limpian al desmontar
- [ ] La impresión de notas funciona igual
- [ ] El registro público (`#/registro`) funciona sin auth
- [ ] El cambio de color de tema se aplica al instante
- [ ] El flujo de pagos múltiples sigue intacto
- [ ] Build de producción sin errores
