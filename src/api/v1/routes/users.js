const express = require('express');
const router = express.Router();

const { getUsers } = require("../mikrotik/index.js")

router.get("/", async (req, res) => {
  const data = await getUsers();
  res.end(JSON.stringify(data))
})

module.exports = router