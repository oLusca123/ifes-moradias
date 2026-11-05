const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "src", "views");
const destination = path.join(__dirname, "..", "dist", "views");

fs.cpSync(source, destination, { recursive: true });
