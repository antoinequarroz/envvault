import { describe, expect, it } from "vitest";
import {
  catalogs,
  createTranslator,
  en,
  fr,
  LANGUAGE_STORAGE_KEY,
  loadLocale,
  saveLocale,
} from "./i18n";

describe("interface translations", () => {
  it("uses French by default and persists an explicit choice", () => {
    expect(loadLocale(window.localStorage)).toBe("fr");
    saveLocale("en", window.localStorage);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(loadLocale(window.localStorage)).toBe("en");
  });

  it("keeps both catalogs complete and non-empty", () => {
    expect(Object.keys(en)).toEqual(Object.keys(fr));
    for (const catalog of Object.values(catalogs)) {
      for (const value of Object.values(catalog)) {
        expect(typeof value === "function" || value.trim().length > 0).toBe(true);
      }
    }
  });

  it("formats variables and plurals in both languages", () => {
    const french = createTranslator("fr");
    const english = createTranslator("en");
    expect(french("protectedProjects", 1)).toBe("1 projet protégé");
    expect(french("protectedProjects", 3)).toBe("3 projets protégés");
    expect(english("filesCount", 2)).toBe("2 files");
    expect(english("bytesCount", 42)).toBe("42 bytes");
    expect(english("lastBackup", "Tuesday")).toBe("Last backup: Tuesday");
  });

  it("falls back to French if local storage is unavailable", () => {
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadLocale(blocked)).toBe("fr");
    expect(() => saveLocale("en", blocked)).not.toThrow();
  });
});
