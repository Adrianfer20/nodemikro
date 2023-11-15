const { MikroClient} = require("./mikrotik-client.js");


const CONFIG = {
    host: '192.168.88.1',
    port: 8728,
    username: 'adhrian',
    password: '2610',
    timeout: 5000,
}
 
const MIKROTIK = new MikroClient(CONFIG)

module.exports = MIKROTIK;
