import { describe, expect, it } from "vitest";
import { buildDailyOutlook, categorizeForecastIcon, type OutlookSourcePeriod } from "./weather-outlook";

function period(overrides: Partial<OutlookSourcePeriod> & Pick<OutlookSourcePeriod, "startTime" | "isDaytime">): OutlookSourcePeriod {
  return {
    temperature: 80,
    shortForecast: "Sunny",
    icon: null,
    probabilityOfPrecipitation: null,
    ...overrides,
  };
}

describe("categorizeForecastIcon", () => {
  it("reads the condition code out of a real NWS icon URL", () => {
    expect(categorizeForecastIcon("https://api.weather.gov/icons/land/day/tsra_hi,40?size=medium", "", true)).toBe(
      "thunderstorm",
    );
  });

  it("takes the first condition when the icon URL carries two", () => {
    expect(
      categorizeForecastIcon("https://api.weather.gov/icons/land/night/skc,0/few,0?size=medium", "", false),
    ).toBe("clear-night");
  });

  it("strips a wind_ prefix before mapping", () => {
    expect(categorizeForecastIcon("https://api.weather.gov/icons/land/day/wind_skc?size=medium", "", true)).toBe(
      "sunny",
    );
  });

  it("picks day vs night for the same underlying condition", () => {
    expect(categorizeForecastIcon("https://api.weather.gov/icons/land/day/skc?size=medium", "", true)).toBe("sunny");
    expect(categorizeForecastIcon("https://api.weather.gov/icons/land/night/skc?size=medium", "", false)).toBe(
      "clear-night",
    );
  });

  it("falls back to the short forecast text when there's no icon", () => {
    expect(categorizeForecastIcon(null, "Chance Showers And Thunderstorms", true)).toBe("thunderstorm");
    expect(categorizeForecastIcon(null, "Partly Cloudy", false)).toBe("partly-cloudy-night");
  });

  it("falls back to text when the icon's condition code isn't recognized", () => {
    expect(categorizeForecastIcon("https://api.weather.gov/icons/land/day/nonsense_code?size=medium", "Rain", true)).toBe(
      "rain",
    );
  });

  it("defaults unrecognized text to cloudy rather than throwing", () => {
    expect(categorizeForecastIcon(null, "Some new NWS phrasing nobody's seen yet", true)).toBe("cloudy");
  });
});

describe("buildDailyOutlook", () => {
  it("pairs a day period with its following night period into one entry, labeled Today first", () => {
    const periods: OutlookSourcePeriod[] = [
      period({
        startTime: "2026-08-26T13:00:00-05:00",
        isDaytime: true,
        temperature: 92,
        shortForecast: "Chance Showers And Thunderstorms",
        icon: "https://api.weather.gov/icons/land/day/tsra_hi,40?size=medium",
        probabilityOfPrecipitation: { value: 40 },
      }),
      period({
        startTime: "2026-08-26T19:00:00-05:00",
        isDaytime: false,
        temperature: 75,
        shortForecast: "Partly Cloudy",
        icon: "https://api.weather.gov/icons/land/night/sct,40?size=medium",
        probabilityOfPrecipitation: { value: 40 },
      }),
    ];

    const outlook = buildDailyOutlook(periods);
    expect(outlook).toHaveLength(1);
    expect(outlook[0]).toMatchObject({
      date: "2026-08-26",
      day_label: "Today",
      high: 92,
      low: 75,
      short_forecast: "Chance Showers And Thunderstorms",
      precipitation_chance: 40,
      icon: "thunderstorm",
    });
  });

  it("labels subsequent days by weekday, not Today", () => {
    const periods: OutlookSourcePeriod[] = [
      period({ startTime: "2026-08-26T13:00:00-05:00", isDaytime: true }),
      period({ startTime: "2026-08-26T19:00:00-05:00", isDaytime: false }),
      period({ startTime: "2026-08-27T06:00:00-05:00", isDaytime: true }),
      period({ startTime: "2026-08-27T18:00:00-05:00", isDaytime: false }),
    ];

    const outlook = buildDailyOutlook(periods);
    expect(outlook).toHaveLength(2);
    expect(outlook[0]!.day_label).toBe("Today");
    expect(outlook[1]!.day_label).toBe("Thu");
  });

  it("handles a trailing period with no pair (a forecast that ends mid-day)", () => {
    const periods: OutlookSourcePeriod[] = [
      period({ startTime: "2026-08-26T13:00:00-05:00", isDaytime: true, temperature: 92 }),
      period({ startTime: "2026-08-26T19:00:00-05:00", isDaytime: false, temperature: 75 }),
      period({ startTime: "2026-08-27T06:00:00-05:00", isDaytime: true, temperature: 90 }),
    ];

    const outlook = buildDailyOutlook(periods);
    expect(outlook).toHaveLength(2);
    expect(outlook[1]).toMatchObject({ high: 90, low: null });
  });

  it("takes the higher precipitation chance across a day's two periods", () => {
    const periods: OutlookSourcePeriod[] = [
      period({
        startTime: "2026-08-26T13:00:00-05:00",
        isDaytime: true,
        probabilityOfPrecipitation: { value: 20 },
      }),
      period({
        startTime: "2026-08-26T19:00:00-05:00",
        isDaytime: false,
        probabilityOfPrecipitation: { value: 60 },
      }),
    ];

    expect(buildDailyOutlook(periods)[0]!.precipitation_chance).toBe(60);
  });

  it("is null, not zero, when neither period reports a precipitation chance", () => {
    const periods: OutlookSourcePeriod[] = [
      period({ startTime: "2026-08-26T13:00:00-05:00", isDaytime: true }),
      period({ startTime: "2026-08-26T19:00:00-05:00", isDaytime: false }),
    ];

    expect(buildDailyOutlook(periods)[0]!.precipitation_chance).toBeNull();
  });

  it("caps the result at maxDays", () => {
    const periods: OutlookSourcePeriod[] = Array.from({ length: 16 }, (_, index) => {
      const day = 26 + Math.floor(index / 2);
      const isDaytime = index % 2 === 0;
      return period({
        startTime: `2026-08-${String(day).padStart(2, "0")}T${isDaytime ? "13" : "19"}:00:00-05:00`,
        isDaytime,
      });
    });

    expect(buildDailyOutlook(periods, 3)).toHaveLength(3);
    expect(buildDailyOutlook(periods)).toHaveLength(5);
  });
});
