# Integración Celda — Reporte de riesgos

Fecha: 2026-02-20
Rama: `integracion/celda-2026-02-20`

## Riesgos identificados

1. **Modelo de autenticación en cliente (alto)**
   - La sesión se controla en `localStorage` y hash de contraseña en Firestore.
   - Riesgo: superficie de ataque mayor que un backend/Auth administrado.
   - Mitigación recomendada: migrar a Firebase Auth real + claims/roles o backend seguro para operaciones sensibles.

2. **Reglas Firestore vs lógica de cliente (alto)**
   - Se agregaron `firestore.rules` e índices, pero su despliegue debe validarse en Emulator.
   - Riesgo: denegaciones inesperadas o huecos de autorización si no se alinea rol/flujo final.
   - Mitigación: matriz de pruebas por rol y transición antes de producción.

3. **Workflow dependiente de validación en app (medio-alto)**
   - La secuencia se valida en `services/workflow.ts` y `db.ts`.
   - Riesgo: cliente modificado puede intentar saltos si reglas no reflejan el mismo control.
   - Mitigación: reforzar transición también en reglas/backend.

4. **Autorización de importe concentrada en ADMIN (medio)**
   - Cambio de política: solo `ADMIN_SISTEMA` autoriza importe.
   - Riesgo operativo: cuello de botella si no hay cobertura/admin de guardia.
   - Mitigación: definir respaldo operativo y SLA de autorización.

5. **Impresión/reimpresión con traza (medio-bajo)**
   - Se exige motivo en reimpresión y se registra bitácora.
   - Riesgo residual: calidad del motivo depende de captura manual.
   - Mitigación: catálogo de motivos y validación mínima de longitud.

## Validaciones técnicas ejecutadas

- Revisión de conflictos de merge: **sin marcadores conflictivos**.
- Duplicados detectados y corregidos: `TABS_BY_ROLE` duplicado en `App.tsx`.
- Compilación TypeScript: se detectaron errores de importación y se corrigieron.

## Recomendación de salida

- Hacer prueba UAT por rol (admin/capturista/consulta/validador/autorizador).
- Probar escenarios críticos: login, alta de trámite, transición de estatus, autorización de importe, impresión original/reimpresión.
- Publicar reglas e índices en entorno controlado antes de producción.
