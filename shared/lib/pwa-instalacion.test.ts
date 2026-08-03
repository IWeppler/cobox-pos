import { describe, expect, it } from "vitest";
import {
  detectarMetodoInstalacion,
  esIOS,
  esNavegadorEmbebido,
  esSafariEnIOS,
} from "./pwa-instalacion";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
  iphoneWhatsApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24",
  ipadOS:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-A346M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; SM-A346M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 Instagram 300.0",
};

const base = {
  displayModeStandalone: false,
  hayPrompt: false,
  maxTouchPoints: 0,
};

describe("esIOS", () => {
  it("reconoce iPhone", () => {
    expect(esIOS(UA.iphoneSafari)).toBe(true);
  });

  it("reconoce el iPad que se hace pasar por Mac", () => {
    expect(esIOS(UA.ipadOS, 5)).toBe(true);
  });

  it("no confunde una Mac de escritorio con un iPad", () => {
    expect(esIOS(UA.macSafari, 0)).toBe(false);
  });

  it("no marca Android", () => {
    expect(esIOS(UA.androidChrome)).toBe(false);
  });
});

describe("esNavegadorEmbebido", () => {
  it("detecta WhatsApp e Instagram", () => {
    expect(esNavegadorEmbebido(UA.iphoneWhatsApp)).toBe(true);
    expect(esNavegadorEmbebido(UA.androidInstagram)).toBe(true);
  });

  it("no marca un navegador normal", () => {
    expect(esNavegadorEmbebido(UA.iphoneSafari)).toBe(false);
    expect(esNavegadorEmbebido(UA.androidChrome)).toBe(false);
  });
});

describe("esSafariEnIOS", () => {
  it("es true sólo en el Safari de iOS", () => {
    expect(esSafariEnIOS(UA.iphoneSafari)).toBe(true);
  });

  it("es false en Chrome de iPhone, que no puede instalar", () => {
    expect(esSafariEnIOS(UA.iphoneChrome)).toBe(false);
  });

  it("es false adentro de WhatsApp", () => {
    expect(esSafariEnIOS(UA.iphoneWhatsApp)).toBe(false);
  });
});

describe("detectarMetodoInstalacion", () => {
  it("en iPhone con Safari pide instalación manual", () => {
    expect(
      detectarMetodoInstalacion({ ...base, userAgent: UA.iphoneSafari }),
    ).toEqual({ tipo: "ios-manual" });
  });

  it("adentro de WhatsApp manda a abrir en Safari", () => {
    expect(
      detectarMetodoInstalacion({ ...base, userAgent: UA.iphoneWhatsApp }),
    ).toEqual({ tipo: "abrir-en-navegador", navegador: "safari" });
  });

  it("adentro de Instagram en Android manda a Chrome", () => {
    expect(
      detectarMetodoInstalacion({ ...base, userAgent: UA.androidInstagram }),
    ).toEqual({ tipo: "abrir-en-navegador", navegador: "chrome" });
  });

  it("en Android con prompt usa el prompt nativo", () => {
    expect(
      detectarMetodoInstalacion({
        ...base,
        userAgent: UA.androidChrome,
        hayPrompt: true,
      }),
    ).toEqual({ tipo: "prompt" });
  });

  it("el prompt nativo le gana a la explicación manual", () => {
    expect(
      detectarMetodoInstalacion({
        ...base,
        userAgent: UA.iphoneSafari,
        hayPrompt: true,
      }),
    ).toEqual({ tipo: "prompt" });
  });

  it("ya instalada gana sobre todo lo demás", () => {
    expect(
      detectarMetodoInstalacion({
        ...base,
        userAgent: UA.iphoneSafari,
        standalone: true,
        hayPrompt: true,
      }),
    ).toEqual({ tipo: "instalada" });

    expect(
      detectarMetodoInstalacion({
        ...base,
        userAgent: UA.androidChrome,
        displayModeStandalone: true,
        hayPrompt: true,
      }),
    ).toEqual({ tipo: "instalada" });
  });

  it("en Android sin prompt todavía no ofrece nada", () => {
    expect(
      detectarMetodoInstalacion({ ...base, userAgent: UA.androidChrome }),
    ).toEqual({ tipo: "no-disponible" });
  });
});
