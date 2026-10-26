"use strict";

function letterFromScore(nilaiAngka) {
  if (
    typeof nilaiAngka !== "number" ||
    !Number.isFinite(nilaiAngka) ||
    nilaiAngka < 0 ||
    nilaiAngka > 100
  ) {
    throw new TypeError("nilai_angka harus bilangan 0 sampai 100");
  }
  if (nilaiAngka >= 85) return "A";
  if (nilaiAngka >= 70) return "B";
  if (nilaiAngka >= 55) return "C";
  if (nilaiAngka >= 40) return "D";
  return "E";
}

module.exports = { letterFromScore };
