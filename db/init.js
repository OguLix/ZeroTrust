"use strict";

const fs = require("fs");
const path = require("path");
const db = require("./index");

db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
db.close();
console.log("skema database berhasil dibuat: " + path.join(__dirname, "schema.sql"));
