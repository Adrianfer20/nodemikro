"use strict";
const net = require("net");

class MikroClient {
    constructor(options) {
        this.loged = false;
        // initialize properties
        this.host = (options && options.host) || '192.168.88.1';
        this.port = (options && options.port) || 8728;
        this.username = (options && options.username) || 'admin';
        this.password = (options && options.password) || '';
        // por defecto el timeout es de 3 segundos osea espera 5 segundos para recibir la dataBUFFER
        this.timeout = (options && options.timeout) || 3000;
        this.sk = new net.Socket();
        // inicializar el socket
        this.sk.connect(this.port, this.host);
    }

    // método para loguear al mikrotik
    async login() {
        return new Promise((resolve, reject) => {
            try {
                const resp = this.writeSentence([
                    '/login',
                    `=name=${this.username}`,
                    `=password=${this.password}`,
                ]);
                if (resp.tag === '!trap') {
                    this.loged = false;
                    resolve(false);
                }
                this.loged = true;
                resolve(true);
            } catch (error) {
                this.loged = false;
                reject('Error al loguear: ' + error);
            }
        });
    }

    // método para enviar las sentencias nativas de mikrotik
    talk(words, type) {
        return new Promise((resolve, reject) => {
            (async () => {
                // loguear al mikrotik
                if ((await this.login()) && this.loged) {
                    // esperar medio segundo para enviar la data
                    setTimeout(async () => {
                        // si no se envía nada retorna un array vacío y emitir un error
                        if (this.writeSentence(words) === 0) {
                            reject(' No se envió nada...');
                        }
                    }, 500);
                    const data = await this.readSentence();
                    if (data.error) {
                        console.error(data.message);
                        reject(data.message);
                        return;
                    }
                    if (type === 'object') {
                        resolve(this.toObj(data.data));
                    }
                    this.close();
                    resolve(data.data);
                } else {
                    reject('Error al loguear...');
                }
            })();
        });
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
