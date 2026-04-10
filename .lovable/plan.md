

## Plan: Redirigir "Mis bonos" y "Mis suscripciones" al tab correspondiente de "Mi cuenta"

### Problema
Al clicar "Mis bonos" o "Mis suscripciones" desde el menú desplegable del widget, se navega a vistas standalone (`mis-bonos`, `mis-suscripciones`) que tienen un fondo oscuro y diseño diferente. El usuario quiere que estas opciones lo lleven a la vista "Mi cuenta" (`UserAccount`) con el tab correspondiente (Bonos o Suscripciones) pre-seleccionado, como se ve en la segunda captura.

### Solución

**Archivo: `src/pages/widget/Widget.tsx`**

1. Añadir un estado `initialAccountTab` para controlar qué tab abrir en "Mi cuenta":
```typescript
const [initialAccountTab, setInitialAccountTab] = useState<string>('reservas');
```

2. Cambiar los onClick del menú desplegable:
   - "Mis bonos": en vez de `setCurrentView('mis-bonos')`, hacer `setInitialAccountTab('bonos'); setCurrentView('mi-cuenta');`
   - "Mis suscripciones": en vez de `setCurrentView('mis-suscripciones')`, hacer `setInitialAccountTab('suscripciones'); setCurrentView('mi-cuenta');`

3. Pasar `initialTab` como prop al componente `UserAccount`.

**Archivo: `src/components/widget/UserAccount.tsx`**

4. Aceptar prop `initialTab?: string` y usarla como valor inicial de `activeTab`:
```typescript
const [activeTab, setActiveTab] = useState(initialTab || 'reservas');
```

5. Añadir useEffect para actualizar `activeTab` cuando cambie `initialTab` (por si el componente ya está montado):
```typescript
useEffect(() => {
  if (initialTab) setActiveTab(initialTab);
}, [initialTab]);
```

### Resultado
- "Mis citas" → Mi cuenta, tab Reservas (como ahora)
- "Mis bonos" → Mi cuenta, tab Bonos
- "Mis suscripciones" → Mi cuenta, tab Suscripciones
- Todo dentro de la misma interfaz consistente de "Mi cuenta"
