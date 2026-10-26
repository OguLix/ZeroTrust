"use strict";

const Database = require("better-sqlite3");
const config = require("../shared/config");

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

module.exports = db;
