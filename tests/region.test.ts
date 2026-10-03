import { describe, expect, it } from "vitest";
import { countryInfo, COUNTRIES, rulesFor } from "@/lib/compliance";
import { countryFromLanguage, detectRegion, parseAcceptLanguage } from "@/lib/region";
import { createUser } from "@/lib/users";

describe("region detection", () => {
  it("uses the time zone when there is no network signal", () => {
    expect(detectRegion({ timeZone: "Asia/Kolkata", languages: ["en-US"] })).toMatchObject({ country: "IN", source: "timezone", supported: true });
  });
  it("prefers a CDN network country over the time zone", () => {
    expect(detectRegion({ networkCountry: "gb", timeZone: "Asia/Kolkata" })).toMatchObject({ country: "GB", source: "network" });
  });
  it("falls back to a supported signal when the network country isn't supported", () => {
    expect(detectRegion({ networkCountry: "BR", timeZone: "America/Chicago" })).toMatchObject({ country: "US", source: "timezone" });
  });
  it("uses the language region as a last resort", () => {
    expect(detectRegion({ timeZone: "UTC", languages: ["en-AU", "en"] })).toMatchObject({ country: "AU", source: "language" });
    expect(countryFromLanguage("zh-Hant-TW")).toBe("TW");
    expect(countryFromLanguage("de")).toBeNull();
  });
  it("reports unsupported countries honestly", () => {
    expect(detectRegion({ languages: ["pt-BR"] })).toMatchObject({ country: "BR", supported: false });
    expect(detectRegion({})).toMatchObject({ country: null, supported: false });
  });
  it("orders Accept-Language by quality", () => {
    expect(parseAcceptLanguage("de;q=0.5, en-IN, en;q=0.9")).toEqual(["en-IN", "en", "de"]);
  });
});

describe("countries map onto markets", () => {
  it("euro-area countries share the EU rules and EUR", () => {
    for (const cc of ["DE", "FR", "IE", "BG", "HR"]) {
      expect(countryInfo(cc)).toMatchObject({ market: "EU", currency: "EUR" });
    }
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(28);
  });
  it("opens a wallet in the country's currency", () => {
    const u = createUser({ name: "Priya Shah", country: "IN", pin: "2468" });
    expect(u).toMatchObject({ country: "IN", jurisdiction: "IN", currency: "INR" });
    const fr = createUser({ name: "Luc Martin", country: "FR", pin: "2468" });
    expect(fr).toMatchObject({ country: "FR", jurisdiction: "EU", currency: "EUR" });
    expect(rulesFor(fr.jurisdiction).coolingOffDays).toBe(14);
  });
  it("refuses unsupported countries", () => {
    expect(() => createUser({ name: "Ana Silva", country: "BR", pin: "2468" })).toThrow(/isn't supported/);
  });
});
