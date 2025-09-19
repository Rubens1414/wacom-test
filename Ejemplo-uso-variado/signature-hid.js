/*
    WACOM STU-540 WebHID Driver
    ___________________________________________________
    Driver para controlar la tableta Wacom STU-540 usando WebHID API
    Autor: Pablo García <pablomorpheo@gmail.com>
    Repo: https://github.com/pabloko/Wacom-STU-WebHID

*/

/* Constructor del driver de la tableta */
var wacomstu540 = function () {

    // Verifica si el navegador soporta WebHID
    if (navigator == null || navigator.hid == null) return null

    /**
     * Configuración del dispositivo, información y capacidades
     * - chunkSize: Tamaño de los chunks para transferencia de imágenes
     * - vid: ID del vendedor USB (Wacom)
     * - pid: ID del producto USB (STU-540)
     * - imageFormat24BGR: Formato de imagen soportado (24 bits BGR)
     * - width/height: Dimensiones de la pantalla
     * - scaleFactor: Factor de escala para convertir coordenadas
     * - pressureFactor: Factor para normalizar la presión del lápiz
     * - refreshRate: Tasa de refresco de la pantalla
     * - tabletWidth/Height: Dimensiones físicas de la tableta
     * - deviceName: Nombre del dispositivo
     * - firmware: Versión del firmware
     * - eSerial: Número de serie
     * - onPenDataCb: Callback para eventos del lápiz
     * - onHidChangeCb: Callback para eventos de conexión/desconexión
     */
    this.config = {
        chunkSize: 253,          // Tamaño máximo de chunk de datos
        vid: 1386,               // Vendor ID de Wacom
        pid: 168,                // Product ID del STU-540
        imageFormat24BGR: 0x04,  // Formato de imagen soportado
        width: 800,              // Ancho de pantalla en pixels
        height: 480,             // Alto de pantalla en pixels
        scaleFactor: 13.5,       // Factor de escala para coordenadas
        pressureFactor: 1023,    // Factor de normalización de presión
        refreshRate: 0,          // Se actualiza al conectar
        tabletWidth: 0,          // Se actualiza al conectar
        tabletHeight: 0,         // Se actualiza al conectar
        deviceName: null,        // Se actualiza al conectar
        firmware: null,          // Se actualiza al conectar
        eSerial: null,          // Se actualiza al conectar
        onPenDataCb: null,      // Callback para datos del lápiz
        onHidChangeCb: null,    // Callback para eventos HID
    }

    /**
     * IDs de reporte HID
     * Estos son los comandos soportados por el dispositivo según el SDK de Wacom
     * Cada comando tiene un ID específico para diferentes funciones
     */
    this.command = {
        penData: 0x01,           // Datos básicos del lápiz
        information: 0x08,       // Información del dispositivo
        capability: 0x09,        // Capacidades del dispositivo
        writingMode: 0x0E,      // Modo de escritura
        eSerial: 0x0F,          // Número de serie electrónico
        clearScreen: 0x20,      // Limpiar pantalla
        inkMode: 0x21,          // Modo de tinta (mostrar/ocultar trazos)
        writeImageStart: 0x25,   // Iniciar transferencia de imagen
        writeImageData: 0x26,    // Datos de imagen
        writeImageEnd: 0x27,     // Finalizar transferencia de imagen
        writingArea: 0x2A,      // Área de escritura
        brightness: 0x2B,       // Brillo de la pantalla
        backgroundColor: 0x2E,   // Color de fondo
        penColorAndWidth: 0x2D, // Color y grosor del lápiz
        penDataTiming: 0x34,    // Datos del lápiz con timing
    }

    // Almacena el dispositivo HID conectado
    this.device = null
    // Almacena los chunks de la última imagen para reenvío sin reprocesar
    this.image = null

    // Methods

    /**
     * Verifica si hay una tableta Wacom compatible conectada
     * Nota: WebHID necesita una llamada positiva a requestDevice para mostrar
     * dispositivos aquí y en eventos HID. No confiar en esto para la primera conexión.
     * @returns {Boolean} true si se encontró un dispositivo compatible
     */
    this.checkAvailable = async function () {
        // Si ya hay un dispositivo conectado, retorna true
        if (this.checkConnected()) return true
        
        // Obtiene lista de dispositivos HID
        let devices = await navigator.hid.getDevices();
        
        // Busca un dispositivo con el VID y PID de la tableta Wacom
        for (let i = 0; i < devices.length; i++) {
            let device = devices[i]
            if (device.vendorId == this.config.vid && device.productId == this.config.pid)
                return true
        }
        return false
    }.bind(this)

    /**
     * Conecta con la tableta Wacom
     * Solicita permiso al usuario, abre la conexión y configura los eventos
     * @returns {Boolean} true si la conexión fue exitosa
     */
    this.connect = async function () {
        // Si ya está conectado, sale
        if (this.checkConnected()) return
        
        // Solicita al usuario permiso para conectar con la tableta
        let dev = await navigator.hid.requestDevice({ 
            filters: [{ 
                vendorId: this.config.vid, 
                productId: this.config.pid 
            }] 
        })
        
        // Si no se seleccionó dispositivo, sale
        if (dev[0] == null) return false
        
        // Guarda referencia al dispositivo
        this.device = dev[0]
        
        // Abre la conexión con el dispositivo
        await this.device.open()
        
        // Configura el handler para leer reportes de entrada (datos del lápiz)
        this.device.addEventListener("inputreport", async function (event) {
            // Si no hay callback configurado, sale
            if (this.config.onPenDataCb == null) return

            // Procesa eventos del lápiz según el SDK de Wacom
            // Solo se implementan onPenData y onPenDataTimeCountSequence
            // dependiendo del modo de escritura (0/1)
            // No se implementa encriptación de Start/End capture
            if (event.reportId == this.command.penData || event.reportId == this.command.penDataTiming) {
                // Crea paquete con la información del lápiz
                let packet = {
                    rdy: (event.data.getUint8(0) & (1 << 0)) !== 0,  // Lápiz cerca de la tableta
                    sw: (event.data.getUint8(0) & (1 << 1)) !== 0,   // Lápiz tocando superficie
                    // Coordenadas transformadas (escaladas)
                    cx: Math.trunc(event.data.getUint16(2) / this.config.scaleFactor), 
                    cy: Math.trunc(event.data.getUint16(4) / this.config.scaleFactor),
                    // Coordenadas crudas de la tableta
                    x: event.data.getUint16(2),
                    y: event.data.getUint16(4),
                    press: 0,    // Presión (se calcula después)
                    seq: null,   // Número de secuencia (modo timing)
                    time: null,  // Timestamp (modo timing)
                }

                // Limpia bits superiores para lectura de presión
                event.data.setUint8(0, event.data.getUint8(0) & 0x0F) 
                // Calcula presión normalizada
                packet.press = event.data.getUint16(0) / this.config.pressureFactor

                // Si está en modo timing, agrega información adicional
                if (event.reportId == this.command.penDataTiming) {
                    packet.time = event.data.getUint16(6,true)  // Timestamp
                    packet.seq = event.data.getUint16(8,true)   // Número secuencial
                }

                // Envía datos al callback configurado
                this.config.onPenDataCb(packet)
            }
        }.bind(this));
        // Read info and capabilities from device and fill the data
        let dv = await this.readData(this.command.capability)
        this.config.tabletWidth = dv.getUint16(1)
        this.config.tabletHeight = dv.getUint16(3)
        this.config.pressureFactor = dv.getUint16(5)
        this.config.width = dv.getUint16(7)
        this.config.height = dv.getUint16(9)
        this.config.refreshRate = dv.getUint8(11)
        this.config.scaleFactor = this.config.tabletWidth / this.config.width
        // ...leftover info unknown / not needed
        dv = await this.readData(this.command.information)
        this.config.deviceName = this.dataViewString(dv, 1, 7)
        this.config.firmware = dv.getUint8(8) + "." + dv.getUint8(9) + "." + dv.getUint8(10) + "." + dv.getUint8(11)
        // ...leftover info unknown / not needed
        dv = await this.readData(this.command.eSerial)
        this.config.eSerial = this.dataViewString(dv, 1)
        
        return true
    }.bind(this)

    /**
     * Retrives general data from the device
     * @returns {Object} info of the device
     */
    this.getTabletInfo = function () {
        if (!this.checkConnected()) return
        return this.config
    }.bind(this)

    /**
     * Configura el color y grosor del trazo del lápiz
     * @param {String} color Color en formato '#RRGGBB'
     * @param {Number} width Grosor del trazo (0-5)
     */
    this.setPenColorAndWidth = async function (color, width) {
        if (!this.checkConnected()) return
        
        // Convierte el color de '#RRGGBB' a Array[r,g,b]
        let c = color.replace('#', '')
                     .split(/(?<=^(?:.{2})+)(?!$)/)
                     .map(e => parseInt("0x" + e, 16))
        
        // Agrega el byte de grosor al final
        c.push(parseInt(width))
        
        // Envía el comando a la tableta
        await this.sendData(this.command.penColorAndWidth, new Uint8Array(c))
    }.bind(this)

    /**
     * Configura la intensidad de la retroiluminación
     * @param {Number} intensity Nivel de brillo (0-3)
     * Nota: No es recomendable llamar esta función frecuentemente
     * Ver: http://developer-docs.wacom.com/faqs/docs/q-stu/stu-sdk-application
     */
    this.setBacklight = async function (intensity) {
        if (!this.checkConnected()) return
        
        // Verifica si ya tiene este valor para evitar escrituras innecesarias
        let dv = await this.readData(this.command.brightness)
        if (dv.getUint8(1) == intensity) return
        
        // Envía el comando con la intensidad y un byte de padding
        await this.sendData(this.command.brightness, new Uint8Array([intensity, 0]))
    }.bind(this)

    /**
     * Configura el color de fondo de la pantalla
     * Nota: Requiere llamar a clearScreen para ver el efecto
     * Nota 2: No es recomendable llamar esta función frecuentemente
     * @param {String} color Color en formato '#RRGGBB'
     */
    this.setBackgroundColor = async function (color) {
        if (!this.checkConnected()) return
        
        // Convierte el color de '#RRGGBB' a Array[r,g,b]
        let c = color.replace('#', '')
                     .split(/(?<=^(?:.{2})+)(?!$)/)
                     .map(e => parseInt("0x" + e, 16))
        
        // Verifica si ya tiene este valor para evitar escrituras innecesarias
        let dv = await this.readData(this.command.backgroundColor)
        if (dv.getUint8(1) == c[0] && 
            dv.getUint8(2) == c[1] && 
            dv.getUint8(3) == c[2]) return
        
        // Envía el comando con el nuevo color
        await this.sendData(this.command.backgroundColor, new Uint8Array(c))
    }.bind(this)

    /**
     * Configura el área de escritura en la tableta
     * @param {Object} p Coordenadas del área {x1,y1,x2,y2}
     * donde (x1,y1) es la esquina superior izquierda y
     * (x2,y2) es la esquina inferior derecha
     */
    this.setWritingArea = async function (p) {
        if (!this.checkConnected()) return
        
        // Crea un paquete de 8 bytes para las coordenadas
        let pk = this.makePacket(8)
        
        // Configura las coordenadas en formato little-endian
        pk.view.setUint16(0, p.x1, true)  // X1 (inicio)
        pk.view.setUint16(2, p.y1, true)  // Y1 (inicio)
        pk.view.setUint16(4, p.x2, true)  // X2 (fin)
        pk.view.setUint16(6, p.y2, true)  // Y2 (fin)
        
        // Envía el comando con el área definida
        await this.sendData(this.command.writingArea, pk.data)
    }.bind(this)

    /**
     * Configura el modo de escritura del lápiz
     * @param {Number} mode Modo de escritura:
     *   0: lápiz básico (solo posición y presión)
     *   1: lápiz suave con datos adicionales de timing
     */
    this.setWritingMode = async function (mode) {
        if (!this.checkConnected()) return
        await this.sendData(this.command.writingMode, new Uint8Array([mode]))
    }.bind(this)

    /**
     * Activa o desactiva la visualización de tinta en la pantalla
     * Nota: Los eventos del lápiz siguen funcionando aunque la tinta esté desactivada
     * @param {Boolean} enabled true para mostrar tinta, false para ocultarla
     */
    this.setInking = async function (enabled) {
        if (!this.checkConnected()) return
        await this.sendData(this.command.inkMode, new Uint8Array([enabled ? 1 : 0]))
    }.bind(this)

    /**
     * Limpia la pantalla, mostrando el color de fondo configurado
     */
    this.clearScreen = async function () {
        if (!this.checkConnected()) return
        await this.sendData(this.command.clearScreen, new Uint8Array([0]))
    }.bind(this)

    /**
     * Send a raw image to the pad. 
     * @param {Array} imageData Image must be BGR 24bpp 800x480. If null, it will send last image.
     */
   this.setImage = async function (imageData) {
    if (!this.checkConnected()) return
    if (imageData != null) {
        this.image = this.splitToBulks(imageData, this.config.chunkSize)
    }
    if (this.image == null) return

    try {
        // Inicio de transferencia de imagen
        await this.sendData(this.command.writeImageStart, new Uint8Array([this.config.imageFormat24BGR]))
        
        // Enviar chunks en secuencia usando for...of en lugar de forEach
        for (const chunk of this.image) {
            await this.sendData(this.command.writeImageData, new Uint8Array([chunk.length, 0].concat(chunk)))
        }
        
        // Finalizar transferencia
        await this.sendData(this.command.writeImageEnd, new Uint8Array([0]))
    } catch (error) {
        console.error('Error sending image:', error)
    }
}.bind(this)

    // Helpers

    /**
     * Check if theres a device connected
     * @returns {Boolean} connection status
     */
    this.checkConnected = function () {
        return this.device != null && this.device.opened
    }.bind(this)

    /**
     * Send direct usb hid feature report (internal usage)
     * @param {Number} reportId ID of the report to read. Use one of this.command
     */
    this.sendData = async function (reportId, data) {
        if (!this.checkConnected()) return
        await this.device.sendFeatureReport(reportId, data)
    }.bind(this)

    /**
     * Get a report from the device (internal usage)
     * @param {Number} reportId ID of the report to read. Use one of this.command
     * @returns {DataView} data returned or null
     */
    this.readData = async function (reportId) {
        if (!this.checkConnected()) return
        return await this.device.receiveFeatureReport(reportId)
    }.bind(this)

    /**
     * Crea un objeto con un array de bytes y su vista de datos
     * (uso interno)
     * @param {number} len Tamaño en bytes del paquete
     * @returns {Object} Objeto con array de bytes (data) y DataView (view)
     */
    this.makePacket = function (len) {
        let p = new Uint8Array(len)       // Array de bytes
        let v = new DataView(p.buffer)    // Vista para manipulación
        return { data: p, view: v }
    }

    /**
     * Divide un array largo en subarrays más pequeños
     * (uso interno para transferencia de imágenes)
     * @param {Array} arr Array con datos de imagen
     * @param {Number} bulkSize Tamaño máximo de cada subarray
     * @returns {Array} Array de subarrays con los datos divididos
     */
    this.splitToBulks = function (arr, bulkSize) {
        const bulks = []
        // Calcula número de chunks necesarios
        for (let i = 0; i < Math.ceil(arr.length / bulkSize); i++) {
            let a = new Array(bulkSize)
            // Copia datos al nuevo chunk
            for (let x = i * bulkSize, z = 0; x < (i + 1) * bulkSize; x++, z++) {
                a[z] = arr[x]
            }
            bulks.push(a)
        }
        return bulks
    }

    /**
     * Obtiene una cadena ASCII desde un DataView
     * @param {DataView} dv Vista de datos a leer
     * @param {Number} offset Posición inicial de lectura
     * @param {Number} length Longitud opcional de la cadena
     * @returns {String} Cadena ASCII resultante
     */
    this.dataViewString = function (dv, offset, length) {
        // Calcula fin de la cadena
        let end = typeof length == 'number' ? offset + length : dv.byteLength
        let text = ''
        let val = -1
        
        // Lee bytes hasta encontrar un 0 o llegar al final
        while (offset < dv.byteLength && offset < end) {
            val = dv.getUint8(offset++)
            if (val == 0) break            // Termina en null
            text += String.fromCharCode(val)
        }
        return text
    }

    // Event handlers

    /**
     * Set the data callback for pen events.
     * @param {Function} func Callback function recives an object:
     * -------------------------------------------------------------------------
     *   	rdy: 	Returns TRUE if the pen is in proximity with the tablet
     *   	sw:  	Returns TRUE if the pen is in contact with the surface
     *   	press: 	Returns pen pressure in tablet units (0-1024)
     *   	cx:     Transformed x
     *   	cy:     Transformed y
     *   	x: 	    Point in X in tablet scale (*13.5)
     *   	y: 	    Point in Y in tablet scale (*13.5)
     *   	time: 	(Only for writingMode=1) timestamp
     *   	seq:  	(Only for writingMode=1) incremental number
     */
    this.onPenData = function (func) {
        this.config.onPenDataCb = func
    }.bind(this)

    /**
     * Set the callback for HID connect and disconnect events from devices matching wacom stu
     * @param {Function} func Callback function recives ("connect/disconnect", hidDeviceObject)
     */
    this.onHidChange = function (func) {
        this.config.onHidChangeCb = func
    }.bind(this)

    // HID events
    navigator.hid.addEventListener("connect", function (e) {
        if (this.config.onHidChangeCb != null && e.device.vendorId == this.config.vid && e.device.productId == this.config.pid)
            this.config.onHidChangeCb('connect', e.device)
    }.bind(this))
    navigator.hid.addEventListener("disconnect", function (e) {
        if (this.config.onHidChangeCb != null && e.device.vendorId == this.config.vid && e.device.productId == this.config.pid)
            this.config.onHidChangeCb('disconnect', e.device)
    }.bind(this))

    return this
}