# Wacom STU WebHID - Implementación en JavaScript

## Agradecimientos

Este proyecto está basado en el excelente trabajo de [pabloko/Wacom-STU-WebHID](https://github.com/pabloko/Wacom-STU-WebHID). Agradecemos enormemente la contribución y el esfuerzo realizado en el desarrollo de esta librería que permite la comunicación con tabletas Wacom STU mediante WebHID API.

## Descripción

Esta implementación permite conectar y utilizar tabletas Wacom STU directamente desde el navegador web utilizando la WebHID API. El proyecto incluye ejemplos prácticos y un servicio JavaScript para facilitar la integración con aplicaciones web.

## Requisitos

- **Navegador compatible con WebHID API**:
  - Google Chrome 89+ 
  - Microsoft Edge 89+
  - Opera 75+
  - Otros navegadores basados en Chromium

- **Conexión HTTPS**: El navegador requiere que la página se sirva a través de HTTPS para acceder a la WebHID API (excepto en localhost)

- **Tableta Wacom STU**: Compatible con modelos STU-300, STU-430, STU-500, STU-520A, STU-530, STU-540, etc.

## Estructura del Proyecto

```
├── Ejemplo-basico.html          # Ejemplo básico de conexión y uso
├── Ejemplo-uso-variado/         # Ejemplos avanzados
│   ├── simple.html              # Implementación simplificada
│   └── signature-hid.js         # Lógica adicional para firmas
├── Templates/                   # Plantillas y recursos
│   └── gondola-signature.jpg    # Imagen de ejemplo
├── wacom.service.js             # Servicio principal para Wacom
└── template.constant.js         # Constantes y configuración
```

## Instalación y Configuración

### 1. Clonar o Descargar

```bash
git clone [tu-repositorio]
cd Wacom
```

### 2. Servir los Archivos

Debido a las restricciones de CORS y WebHID, necesitas servir los archivos a través de un servidor web:

**Opción 1: Usando Python**
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

**Opción 2: Usando Node.js**
```bash
npx http-server
```

**Opción 3: Usando PHP**
```bash
php -S localhost:8000
```

### 3. Acceder desde el Navegador

Abre tu navegador y navega a:
```
http://localhost:8000/Ejemplo-basico.html
```

## Uso Básico

### 1. Conectar la Tableta

1. Conecta físicamente tu tableta Wacom STU al puerto USB
2. Abre el ejemplo en tu navegador
3. Haz clic en el botón **"CONNECT"**
4. Selecciona tu dispositivo Wacom en el diálogo que aparece

### 2. Ejemplo de Código

```javascript
import { WacomService } from './wacom.service.js';

// Crear instancia del servicio
const wacomService = new WacomService();

// Conectar a la tableta
async function connectWacom() {
    const connected = await wacomService.connect();
    if (connected) {
        console.log('Conectado a la tableta Wacom');
        // La tableta está lista para usar
    } else {
        console.log('No se pudo conectar a la tableta Wacom');
    }
}

// Verificar dispositivos disponibles
let devices = await navigator.hid.getDevices();
if (devices.length > 0) {
    console.log('Se detectó la tableta Wacom');
} else {
    console.log('No se pudo detectar la tableta Wacom');
}
```

## Ejemplos Incluidos

### `Ejemplo-basico.html`
- Conexión básica con la tableta
- Canvas para capturar firmas
- Interfaz simple con botón de conexión

### `Ejemplo-uso-variado/simple.html`
- Implementación más avanzada
- Manejo de eventos de pluma
- Configuración personalizable

## Configuración del Servicio

El `WacomService` incluye configuración personalizable:

```javascript
this.config = {
    chunkSize: 253,           // Tamaño de chunk para datos
    vid: 1386,                // Vendor ID de Wacom
    pid: 168,                 // Product ID
    imageFormat24BGR: 0x04,   // Formato de imagen
    width: 800,               // Ancho del canvas
    height: 480,              // Alto del canvas
    scaleFactor: 13.5,        // Factor de escala
    pressureFactor: 1023,     // Factor de presión
    // ... más configuraciones
};
```

## Solución de Problemas

### La tableta no se detecta
- Verifica que esté conectada físicamente
- Asegúrate de que el navegador soporte WebHID
- Comprueba que la página se sirva por HTTPS o localhost

### Error de permisos

En Linux, si la tableta no se detecta o tienes errores de permisos, probablemente debas agregar una regla de udev:

#### ✅ Solución: agregar una regla de udev

1. **Verifica tu dispositivo:**
    ```bash
    lsusb
    ```
    Deberías ver algo como:
    ```
    Bus 001 Device 005: ID 056a:00a8 Wacom Co., Ltd STU-540
    ```
    El primer número (`056a`) es el vendorId (en decimal → 1386).
    El segundo (`00a8`) es el productId (en decimal → 168).

2. **Crea una regla en `/etc/udev/rules.d/99-wacom.rules`:**
    ```bash
    sudo nano /etc/udev/rules.d/99-wacom.rules
    ```
    Y agrega:
    ```
    SUBSYSTEM=="hidraw", ATTRS{idVendor}=="056a", MODE="0666"
    ```
    (Esto da acceso a todos los usuarios. Si quieres restringir, usa `GROUP="plugdev"` en lugar de `MODE="0666"` y asegúrate de estar en ese grupo).

3. **Recarga reglas:**
    ```bash
    sudo udevadm control --reload-rules
    sudo udevadm trigger
    ```

4. **Desconecta y vuelve a conectar el dispositivo.**

5. **Reinicia Chrome/Edge y prueba otra vez.**

#### 🔎 Para probar rápido sin reglas
Si quieres confirmar que es un problema de permisos, ejecuta Chrome con permisos de root:
```bash
sudo google-chrome --enable-features=HidEnableWebHid
```
Si ahí sí conecta → confirmamos que son permisos de udev.

### Problemas de conexión
- Intenta desconectar y reconectar la tableta
- Reinicia el navegador
- Verifica que no haya otras aplicaciones usando la tableta

## Navegadores Soportados

| Navegador | Versión Mínima | Estado |
|-----------|----------------|--------|
| Chrome    | 89+            | ✅ Soportado |
| Edge      | 89+            | ✅ Soportado |
| Opera     | 75+            | ✅ Soportado |
| Firefox   | -              | ❌ No soportado |
| Safari    | -              | ❌ No soportado |

## Contribuir

Si encuentras bugs o tienes sugerencias de mejora:

1. Crea un issue describiendo el problema
2. Si tienes una solución, envía un pull request
3. Asegúrate de probar en diferentes navegadores

## Licencia

Este proyecto mantiene la misma licencia que el proyecto original de pabloko.

## Créditos

- **Proyecto Original**: [pabloko/Wacom-STU-WebHID](https://github.com/pabloko/Wacom-STU-WebHID)
- **WebHID API**: Desarrollada por el equipo de Chrome
- **Wacom**: Por sus excelentes dispositivos de firma digital

---

*Para más información sobre la WebHID API, visita la [documentación oficial de MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API).*