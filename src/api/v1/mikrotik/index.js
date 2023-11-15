const MIKROTIK = require("./mikrotik.config.js")

const getUsers = async () => {
  const json = await MIKROTIK
      .talk(['/ip/hotspot/user/print'])
      .then(async (res) => JSON.stringify(res))
  return json
}




module.exports = {getUsers};