import { describe, it, expect } from "vitest";
import { decodeCsvBuffer } from "./decode-csv-file";

function bufferFromBytes(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe("decodeCsvBuffer", () => {
  it("decodifica un buffer UTF-8 válido tal cual", () => {
    const text = "nombre,telefono\nJosé Peña,123\n";
    const buffer = new TextEncoder().encode(text).buffer;
    expect(decodeCsvBuffer(buffer)).toBe(text);
  });

  it("cae a windows-1252 cuando los bytes no son UTF-8 válido (Ñ real de Excel/Sheets)", () => {
    // "nombre\nMU\xD1OZ\n" con Ñ codificada en windows-1252 (byte 0xD1),
    // que como continuation byte de UTF-8 es inválido sin su leading byte.
    const bytes = [
      ...Array.from("nombre\nMU", (c) => c.charCodeAt(0)),
      0xd1, // "Ñ" en windows-1252
      ...Array.from("OZ\n", (c) => c.charCodeAt(0)),
    ];
    const buffer = bufferFromBytes(bytes);
    expect(decodeCsvBuffer(buffer)).toBe("nombre\nMUÑOZ\n");
  });

  it("decodifica tildes en windows-1252 correctamente (José)", () => {
    const bytes = [
      ...Array.from("Jos", (c) => c.charCodeAt(0)),
      0xe9, // "é" en windows-1252
    ];
    const buffer = bufferFromBytes(bytes);
    expect(decodeCsvBuffer(buffer)).toBe("José");
  });
});
