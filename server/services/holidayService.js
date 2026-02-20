/**
 * Fetches Ecuador public holidays from the Nager.Date API.
 * Results are cached in memory by year — only one API call per year per server lifetime.
 * Only fetches the last 2 years + current year (most relevant for analysis).
 */

const CACHE = new Map();     // year → Array<{ date, name }>
const IN_FLIGHT = new Map(); // year → Promise (prevents duplicate concurrent requests)

async function fetchForYear(year) {
  if (CACHE.has(year)) return CACHE.get(year);
  if (IN_FLIGHT.has(year)) return IN_FLIGHT.get(year);

  const promise = (async () => {
    try {
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/EC`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) {
        CACHE.set(year, []);
        return [];
      }
      const data = await response.json();
      const holidays = data.map(h => ({ date: h.date, name: h.localName || h.name }));
      CACHE.set(year, holidays);
      return holidays;
    } catch (err) {
      console.warn(`[holidayService] Could not fetch holidays for ${year}:`, err.message);
      CACHE.set(year, []);
      return [];
    } finally {
      IN_FLIGHT.delete(year);
    }
  })();

  IN_FLIGHT.set(year, promise);
  return promise;
}

/**
 * Returns Ecuador holidays for the most recent years relevant to analysis.
 * Caps at 3 years (previous year, current year, + 1 future) regardless of data range,
 * to avoid slow timeouts when data spans many years back.
 */
export async function getHolidaysForRange(minDate, maxDate) {
  const dataMaxYear = new Date(maxDate).getFullYear();
  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(dataMaxYear, currentYear);
  // Only fetch the last 2 years + max year (e.g. 2024, 2025, 2026)
  const minYear = Math.max(maxYear - 2, new Date(minDate).getFullYear());

  const results = await Promise.all(
    Array.from({ length: maxYear - minYear + 1 }, (_, i) => fetchForYear(minYear + i))
  );

  return results.flat().sort((a, b) => a.date.localeCompare(b.date));
}
