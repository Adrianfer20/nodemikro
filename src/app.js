const express = require('express');
const app = express();
const port = 3000; // Puedes cambiar el puerto según tu preferencia

// Motor de plantilla
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

app.use("/api/v1", require("./api/v1/index.js"))

app.get("/", (req, res) => {
  res.render("index");
});


app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
