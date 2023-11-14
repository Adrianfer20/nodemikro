const MIKROTIK = require("./mikrotik.config.js")

const getUsers = async () => {
  try {
    const response = await MIKROTIK.talk(['/ip/hotspot/user/print']);
    const json = JSON.stringify(response);
    return {
      success: true,
      data: json,
    };
  } 
  //Manejar ERROR
  catch (error) {
    console.error("Error:", error);
    return {
      success: false,
      error: {
        message: "Hubo un error al obtener los datos",
        details: error.message, // Puedes incluir detalles específicos del error si es necesario
      },
    };
  }
}




module.exports = {getUsers};