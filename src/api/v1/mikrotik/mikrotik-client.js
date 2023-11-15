"use strict";
const net = require("net");

class MikroClient {
    constructor(options) {
        // initialize properties
        this.host = options?.host || '192.168.88.1';
        this.port = options?.port || 8728;
        this.username = options?.username || 'admin';
        this.password = options?.password || '';
        this.timeout = options?.timeout || 3000;
        this.loged = false;
        this.sk = new net.Socket();
        this.error = null; // Variable para almacenar errores
    }

    initializeSocket() {
        try {
            this.sk.connect(this.port, this.host);
        } catch (error) {
            this.error = { error: true, message: `Error al conectar con el servidor: ${error.message}` };
            this.sk.destroy(); // Cerrar el socket en caso de error
        }
        this.sk.on('error', (error) => {
            this.error = { error: true, message: `Error de conexión: ${error.message}` };
            this.sk.destroy(); // Cerrar el socket en caso de error
        });
    
    }
    

    // Método para loguear al mikrotik
    async login() {
        try {
            await this.initializeSocket();

            const resp = await this.writeSentence([
                '/login',
                `=name=${this.username}`,
                `=password=${this.password}`,
            ]);

            if (resp.tag === '!trap') {
                this.loged = false;
                return { success: false, error: { message: 'Error en el login' } };
            }

            this.loged = true;
            return { success: true, data: resp.data };
        } catch (error) {
            this.loged = false;
            return { success: false, error: { message: `Error al loguear: ${error.message}` } };
        }
    }

    // Método para enviar las sentencias nativas de Mikrotik
    async talk(words, type) {
        try {
            const loginResult = await this.login();

            if (!loginResult.success) {
                return loginResult; // Devolver error si el login no fue exitoso
            }

            // Esperar medio segundo para enviar la data
            await new Promise(resolve => setTimeout(resolve, 500));

            const sentCount = this.writeSentence(words);

            if (sentCount === 0) {
                return { success: false, error: { message: 'No se envió nada...' } };
            }

            const data = await this.readSentence();

            if (data.error) {
                return { success: false, error: { message: data.message } };
            }

            if (type === 'object') {
                return { success: true, data: this.toObj(data.data) };
            }

            this.close();
            return { success: true, data: data.data };
        } catch (error) {
            return { success: false, error: { message: `Error en la comunicación con el servidor: ${error.message}` } };
        }
    }


    
    // método para convertir la data en un objeto más fácil de manejar
    toObj(data) {
        // eliminar los strings vacíos del array y los arrays con !done
        let arrayData = data.filter((e) => e !== '' && !e.includes('!done'));
        // dividir el array en más arrays cada que haya un string con la palabra !re
        const arr = arrayData.reduce((acc, curr) => {
            // agregar un nuevo array a acc si curr incluye !re, de lo contrario no hacer nada
            curr.includes('!re') ? acc.push([]) : null;
            // concatenar curr al último elemento de acc
            acc[acc.length - 1] = [...acc[acc.length - 1], curr];
            return acc;
        }, [[]]);
        // eliminar el primer elemento vacío de arr
        arr.shift();
        // convertir cada array en un objeto
        return arr.map((a) => {
            // eliminar los elementos que no contienen el carácter = y eliminar el carácter = de cada elemento
            a = a.filter((e) => e.includes('=')).map((e) => e.replace('=', ''));
            // convertir el array en un objeto
            return a.reduce((acc, curr) => {
                // asignar el valor de curr a la propiedad correspondiente del objeto acc
                let [key, value] = curr.split('=');
                // si la key es .id, quitar el . y quitar su asterisco del value
                if (key === '.id') {
                    key = 'id';
                    value = value.replace('*', '');
                }
                // convertir la key en camelCase si tiene guion medio
                key = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                // convertir en int o float la propiedad value si es posible
                value = isNaN(Number(value)) ? value : Number(value);
                // convertir en booleano la propiedad value si es posible
                value =
                    value === 'true' ? true : value === 'false' ? false : value;
                return Object.assign(Object.assign({}, acc), { [key]: value });
            }, {});
        });
    }

    // método para leer las sentencias del mikrotik
    async readSentence() {
        const data = await this.readeBuffer();
        if (data.error) {
            return { error: true, message: data.message };
        }
        const decoded = this.decodeBuffer(data.data);
        let data2 = {
            tag: decoded[0],
            data: decoded.slice(1),
        };
        return data2;
    }

    // método para leer las respuestas del mikrotik en formato buffer retorna un objeto que indica si ha ocurrido un error
    readeBuffer() {
        return new Promise((resolve) => {
            // variable para almacenar el buffer
            let buffer = Buffer.alloc(0);
            // evento que se dispara cuando se recibe data
            this.sk.on('data', (data) => {
                // se concatena el buffer con la data recibida
                buffer = Buffer.concat([buffer, data]);
            });
            // esperar 5 segundos para que se reciba la data
            setTimeout(() => {
                // si el buffer está vacío se devuelve un objeto de error
                if (buffer.length === 0) {
                    this.error ?
                    resolve(this.error) :
                    resolve({ error: true, message: 'No se recibió data' });
                }
                // si el buffer tiene data se devuelve el buffer
                resolve({ error: false, data: buffer });
            }, this.timeout);
        });
    }

    // decodificador de buffer, convierte en un array de strings las respuestas que envía el router
    decodeBuffer(buff) {
        const data = [];
        // leer el buffer el primer byte es el length
        let idx = 0;
        while (idx < buff.length) {
            let len;
            let b = buff[idx++];
            len =
                b & 128
                    ? (b & 192) == 128
                        ? ((b & 63) << 8) + buff[idx++]
                        : (b & 224) == 192
                            ? (((b & 31) << 8) + buff[idx++]) << (8 + buff[idx++])
                            : (b & 240) == 224
                                ? ((((b & 15) << 8) + buff[idx++]) << (8 + buff[idx++])) <<
                                    (8 + buff[idx++])
                                : b
                    : b;
            data.push(buff.slice(idx, idx + len).toString('utf8'));
            idx += len;
        }
        return data;
    }

    writeSentence(words) {
        // si no existe el string login entre en array de palabras
        let ret = 0;
        if (this.loged || words.includes('/login')) {
            for (const word of words) {
                // escribe el length(largo) de la palabra
                this.writeLen(Buffer.byteLength(word));
                // escribe la palabra al socket
                this.sk.write(word, 'utf-8');
                ret += 1;
            }
            // escribe el length de la palabra vacía para indicar el final de la frase o sentence
            this.writeLen(0);
            return ret;
        }
        return ret;
    }

    writeLen(length) {
        const buffer = this.getVarIntBuffer(length);
        this.sk.write(buffer);
    }

    getVarIntBuffer(length) {
        const byteCount = this.getVarIntByteCount(length);
        const buffer = Buffer.alloc(byteCount);
        for (let i = 0; i < byteCount; i++) {
            buffer[i] = (length >>> (8 * i)) & 0xff;
        }
        return buffer;
    }

    getVarIntByteCount(length) {
        if (length < 0x80)
            return 1;
        if (length < 0x4000)
            return 2;
        if (length < 0x200000)
            return 3;
        if (length < 0x10000000)
            return 4;
        return 5;
    }

    // método para cerrar la conexión y liberar el socket y la memoria y el puerto y todo
    close() {
        this.sk.destroy();
    }
}

exports.MikroClient = MikroClient;
