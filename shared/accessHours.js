"use strict";

const config = require("./config");

function isWithinAccessHours(date, options) {
  const opts = options || config.accessHours;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: opts.tz,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  const hour = Number(hourPart.value);
  return hour >= opts.start && hour < opts.end;
}

module.exports = { isWithinAccessHours };
