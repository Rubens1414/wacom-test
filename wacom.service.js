import {srcConst} from './template.constant.js';

export class WacomService {
    constructor() {
        this.canvas = document.getElementById('myCanvas')    // Elemento canvas
        this.context = myCanvas.getContext("2d")            // Contexto 2D para dibujar
        this.img = new Image()                              // Objeto para cargar imágenes
        this.pen_state = false;
        this.enviadoFlag = false;
        this.enviadoBorrar = false;
        this.areaEnvio = [
            [356, 356], // esquina superior derecha
            [142, 364], // esquina superior izquierda
            [148, 397], // esquina inferior izquierda
            [363, 403]  // esquina inferior derecha
        ];
        this.areaBorrar = [
            [436, 364],
            [653, 364],
            [653, 406],
            [436, 406]
        ];
        this.poly = null;
        this.lastPressure=0.0;
        this.config = {
            chunkSize: 253,
            vid: 1386,
            pid: 168,
            imageFormat24BGR: 0x04,
            width: 800,
            height: 480,
            scaleFactor: 13.5,
            pressureFactor: 1023,
            refreshRate: 0,
            tabletWidth: 0,
            tabletHeight: 0,
            deviceName: null,
            firmware: null,
            eSerial: null,
            onPenDataCb: null,
            onHidChangeCb: null,
        };

        this.command = {
            penData: 0x01,
            information: 0x08,
            capability: 0x09,
            writingMode: 0x0E,
            eSerial: 0x0F,
            clearScreen: 0x20,
            inkMode: 0x21,
            writeImageStart: 0x25,
            writeImageData: 0x26,
            writeImageEnd: 0x27,
            writingArea: 0x2A,
            brightness: 0x2B,
            backgroundColor: 0x2E,
            penColorAndWidth: 0x2D,
            penDataTiming: 0x34,
        };
        console.log('FUNCIONAAAA');
        this.device = null;
        this.image = null;

        // Eventos de conexión/desconexión
        navigator.hid.addEventListener("connect", (e) => {
            if (
                this.config.onHidChangeCb &&
                e.device.vendorId === this.config.vid &&
                e.device.productId === this.config.pid
            ) {
                this.config.onHidChangeCb("connect", e.device);
            }
        });
        navigator.hid.addEventListener("disconnect", (e) => {
            if (
                this.config.onHidChangeCb &&
                e.device.vendorId === this.config.vid &&
                e.device.productId === this.config.pid
            ) {
                this.config.onHidChangeCb("disconnect", e.device);
            }
        });
    }

   makePacket(len) {
         let p = new Uint8Array(len)       // Array de bytes
        let v = new DataView(p.buffer)    // Vista para manipulación
        return { data: p, view: v }
    }

    checkConnected() {
        return this.device?.opened;
    }

    async checkAvailable(device) {
        if (this.checkConnected()) return true;
        if (
                    device.vendorId === this.config.vid &&
                    device.productId === this.config.pid
        ){
                 return true;
        }      

        return false;
    }

    async connect() {

        if (this.checkConnected()) return true;
        let dev = await navigator.hid.requestDevice({
            filters: [
                {
                    vendorId: this.config.vid,
                    productId: this.config.pid,
                },
            ],
        });
        if (!dev[0]) return false;
        this.device = dev[0];
        await this.device.open();

        // Handler para datos del lápiz
        this.device.addEventListener(
            "inputreport",
            async (event) => {
                if (!this.config.onPenDataCb) return;
                if (
                    event.reportId === this.command.penData ||
                    event.reportId === this.command.penDataTiming
                ) {
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
                    event.data.setUint8(
                        0,
                        event.data.getUint8(0) & 0x0f
                    );
                    packet.press =
                        event.data.getUint16(0, true) /
                        this.config.pressureFactor;
                    if (event.reportId === this.command.penDataTiming) {
                        packet.time = event.data.getUint16(6, true);
                        packet.seq = event.data.getUint16(8, true);
                    }
                    this.config.onPenDataCb(packet);
                }
            }
        );

        // Leer capacidades e información
        let dv = await this.readData(this.command.capability)
        this.config.tabletWidth = dv.getUint16(1)
        this.config.tabletHeight = dv.getUint16(3)
        this.config.pressureFactor = dv.getUint16(5)
        this.config.width = dv.getUint16(7)
        this.config.height = dv.getUint16(9)
        this.config.refreshRate = dv.getUint8(11)
        this.config.scaleFactor = this.config.tabletWidth / this.config.width

        dv = await this.readData(this.command.information);
        if (!dv) return false;
        this.config.deviceName = this.dataViewString(dv, 1, 7);
        this.config.firmware =
            dv.getUint8(8) +
            "." +
            dv.getUint8(9) +
            "." +
            dv.getUint8(10) +
            "." +
            dv.getUint8(11);

        dv = await this.readData(this.command.eSerial);
        if (!dv) return false;
        this.config.eSerial = this.dataViewString(dv, 1);

        // Configuración inicial
        await this.setWritingArea(0, 0, 800,  480);
        await this.clearScreen();
        await this.setPenColorAndWidth('#000000', 1);
        this.onPenData(this.pointevent.bind(this));
        this.img.onload = this.loadImg.bind(this);
        setTimeout(() => {
            this.img.src = srcConst.gondolaSignatureTemplate;
        }, 150)
        return true;
    }
    async setPenColorAndWidth(color, width) {
        if (!this.checkConnected()) return
        
        // Convierte el color de '#RRGGBB' a Array[r,g,b]
        let c = color.replace('#', '')
                     .split(/(?<=^(?:.{2})+)(?!$)/)
                     .map(e => parseInt("0x" + e, 16))
        
        // Agrega el byte de grosor al final
        c.push(parseInt(width))
        
        // Envía el comando a la tableta
        await this.sendData(this.command.penColorAndWidth, new Uint8Array(c))
    }
    async  loadImg() {
        this.context.drawImage(this.img, 0, 0, 800, 480);
        // Establece el área de escritura si no es la imagen por defecto
        if (!this.img.src.includes("gondola-signature.jpg")) {
            await this.setWritingArea({ x1: 0, y1: 0, x2: 800, y2: 480 })
        }

            let imageData = this.context.getImageData(0, 0, 800, 480)
            console.log('Loaded image size: ' + imageData.data.length)
            const rgb24 = new Uint8Array((imageData.data.length / 4) * 3)
            let i = 0, j = 0;
            while (i < imageData.data.length) {
                rgb24[j++] = imageData.data[i + 2]  // B
                rgb24[j++] = imageData.data[i + 1]  // G
                rgb24[j++] = imageData.data[i + 0]  // R
                i += 4
            }
            this.image = rgb24
           
            await this.sendimage()
    }
     async  sendimage() {
        console.log(this.image)
        await this.setImage(this.image)       // Envía imagen actual
        ssvvgg.innerHTML = ''             // Limpia SVG
        await this.inkmode()                   // Restaura modo de tinta
    }
    splitToBulks(arr, bulkSize) {
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
    async setImage(imageData) {
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
    }
     async clearDrawing() {
        // Limpiar el SVG en la interfaz
        ssvvgg.innerHTML = '';
        
        if ( this.device) {
            try {
                // Reenviar la última imagen para limpiar los trazos
                await this.setInking(false); 
                await this.setImage(this.image);
                await this.setInking(true);
            } catch (error) {
                console.error('Error clearing drawing:', error);
            }
        }
    }
    async setInking(enabled = true) {
        if (!this.checkConnected()) return
        await this.sendData(this.command.inkMode, new Uint8Array([enabled ? 1 : 0]))
    }

    async pointevent(packet) {
        // Modificamos la detección del contacto para que coincida con simple.html
        const z = packet.press > 0;  // Contacto basado en presión en lugar de sw
        const x = packet.cx;         // Usando coordenadas transformadas
        const y = packet.cy;
        const p = packet.press;

        if (z && !this.pen_state) {
            this.addpoly();
        }

        if (z) {
            // Acciones de área de envío/borrado
            if (this.pointInPolygon(x, y, this.areaEnvio) && !this.enviadoFlag) {
                console.log("enviado");
                this.enviadoFlag = true;
            }
            if (this.pointInPolygon(x, y, this.areaBorrar) && !this.enviadoBorrar) {
                console.log("borrado");
                await this.clearDrawing();
                this.enviadoBorrar = true;
            }

            if (this.pressdiff(p, this.lastPressure) > 0.02) {
                this.polypoint(x, y);
                this.lastPressure = p;
            }
            this.polypoint(x, y);
            console.log(
                    `x:${x} y:${y} p:${p.toFixed(2)} | xRaw:${packet.x} yRaw:${packet.y} (escala: ${this.config.scaleFactor.toFixed(2)})`
                );
        } else {
            this.enviadoFlag = false;
            this.enviadoBorrar = false;
        }
        this.pen_state = z;
    }
    
   
  
    
   
   
     async  inkmode( enabled = true) {
         if (!this.checkConnected()) return
        await this.sendData(this.command.inkMode, new Uint8Array([enabled ? 1 : 0]))
    }
    async clearScreen() {
        if (!this.checkConnected()) return
        await this.sendData(this.command.clearScreen, new Uint8Array([0]))
    }
    async sendData(reportId, data) {
        if (!this.checkConnected()) return;
        await this.device.sendFeatureReport(reportId, data);
    }

    async readData(reportId) {
        if (!this.checkConnected()) {
            console.warn("No device connected");
            return null;
        }
        try {
            let rep = await this.device.receiveFeatureReport(reportId);
            if (!rep) {
                console.warn("No report received for reportId", reportId);
                return null;
            }
            // Algunos navegadores devuelven {data: DataView}, otros solo DataView
            if (rep.data) return rep.data;
            if (rep instanceof DataView) return rep;
            console.warn("Unknown report format", rep);
            return null;
        } catch (e) {
            console.error("Error in readData:", e);
            return null;
        }
    }

    async setWritingArea(x1, y1, x2, y2) {
        if (!this.checkConnected()) return
        
        // Crea un paquete de 8 bytes para las coordenadas
        let pk = this.makePacket(8)
        
        // Configura las coordenadas en formato little-endian
        pk.view.setUint16(0, x1, true)  // X1 (inicio)
        pk.view.setUint16(2, y1, true)  // Y1 (inicio)
        pk.view.setUint16(4, x2, true)  // X2 (fin)
        pk.view.setUint16(6, y2, true)  // Y2 (fin)
        
        // Envía el comando con el área definida
        await this.sendData(this.command.writingArea, pk.data)
    }

    dataViewString(dv, offset, length) {
        let end =
            typeof length === "number" ? offset + length : dv.byteLength;
        let text = "";
        let val = -1;
        while (offset < dv.byteLength && offset < end) {
            val = dv.getUint8(offset++);
            if (val === 0) break;
            text += String.fromCharCode(val);
        }
        return text;
    }

    onPenData(func) {
        this.config.onPenDataCb = func;
    }
    pressdiff(a, b) {
        if (a > b)  return a - b
        else return b - a
    }
    onHidChange(func) {
        this.config.onHidChangeCb = func;
    }
    
     
     addpoly() {
        // Reinicia la presión al iniciar un nuevo trazo
        this.lastPressure = 0.0;
        // Crea elemento polyline SVG
        this.poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        // Configura estilo: sin relleno, color del lápiz y grosor sensible a presión
        this.poly.setAttributeNS(null, "style", "fill:none;stroke:" + "#000000ff" + ";stroke-width:" + this.makestroke(parseInt(2)) + ";")
        // Agrega al contenedor SVG
        ssvvgg.append(this.poly)
    }
    makestroke(v) {
        // Desplaza la escala (0.5-1.5) para permitir magnificación y reducción
        let pf = this.lastPressure + 0.5  
        // Asegura un ancho mínimo del trazo
        return Math.max(v * pf, 0.5)
    }

    polypoint(x, y) {
        // Crea punto SVG
        let point = ssvvgg.createSVGPoint()
        point.x = x
        point.y = y
        // Agrega al polyline actual
        if (this.poly) {
            this.poly.points.appendItem(point)
        }
    }
    pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi + 0.00001) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}