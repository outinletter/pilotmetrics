import { ROUTE_PAIRS } from "../data/route_pairs";
import { KAC_CSV_SCHEDULE } from "../data/kac_csv_schedule";

export type FlightSource =
  | "kac_gw_int"
  | "kac_gw_dom"
  | "kac_international_csv"
  | "route_pairs_fallback"
  | "invalid_input";

export interface FlightLookupResult {
  flight: Record<string, unknown>;
  source: FlightSource;
  message: string | null;
  errors: Array<{
    stage: string;
    message: string;
  }>;
}

export function normalizeFlightNumber(fn: string): string {
  const value = String(fn ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (
    value.startsWith("KAL") &&
    /^\d+$/.test(value.slice(3))
  ) {
    return `KE${value.slice(3)}`;
  }

  return value;
}

function candidates(fn: string): string[] {
  fn = normalizeFlightNumber(fn);

  if (
    fn.length >= 4 &&
    /^\d+$/.test(fn.slice(2))
  ) {
    const airline = fn.slice(0, 2);
    const num = parseInt(fn.slice(2), 10);

    return [
      ...new Set([
        fn,
        `${airline}${num}`,
        `${airline}${String(num).padStart(3, "0")}`,
      ]),
    ];
  }

  return [fn];
}

function cleanValue(value: unknown): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const valueString = String(value).trim();

  if (
    !valueString ||
    valueString.toUpperCase() === "NULL" ||
    valueString === "-"
  ) {
    return null;
  }

  return valueString;
}

function firstValue(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = cleanValue(row[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeAirportCode(
  value: string | null,
): string | null {
  if (!value) return null;

  const v = value.toUpperCase().trim();

  if (/^[A-Z]{3}$/.test(v)) {
    return v;
  }

  const icaoToIata: Record<string, string> = {
    RKSI: "ICN",
    RKSS: "GMP",
    RKPK: "PUS",
    RKPC: "CJU",
    RKNY: "YNY",
    RKTU: "CJJ",
    RKJB: "MWX",
    RKJJ: "KWJ",
    RKPS: "HIN",
    RKJY: "RSU",
    RKTH: "USN",
    RKTN: "TAE",
    RKPU: "PUS",
  };

  return icaoToIata[v] ?? v;
}

/* -------------------------------------------------------------------------- */
/* ROUTE_PAIRS — final fallback only                                         */
/* -------------------------------------------------------------------------- */

function guessKeRoute(
  fn: string,
): {
  departure_iata: string;
  arrival_iata: string;
  aircraft_type: string;
} | null {
  if (!fn.startsWith("KE")) {
    return null;
  }

  const num = parseInt(fn.slice(2), 10);

  if (isNaN(num)) {
    return null;
  }

  const outbound = num % 2 === 1;

  if (num >= 1000) {
    let routeCandidates: [string, string][] = [];

    if (num >= 1001 && num <= 1999) {
      routeCandidates = outbound
        ? [
            ["GMP", "CJU"],
            ["PUS", "CJU"],
            ["ICN", "PUS"],
            ["GMP", "PUS"],
            ["GMP", "USN"],
            ["GMP", "RSU"],
          ]
        : [
            ["CJU", "GMP"],
            ["CJU", "PUS"],
            ["PUS", "ICN"],
            ["PUS", "GMP"],
            ["USN", "GMP"],
            ["RSU", "GMP"],
          ];
    } else if (
      num >= 2101 &&
      num <= 2199
    ) {
      routeCandidates = outbound
        ? [["GMP", "HND"]]
        : [["HND", "GMP"]];
    } else if (
      num >= 2701 &&
      num <= 2800
    ) {
      routeCandidates = outbound
        ? [
            ["GMP", "SHA"],
            ["GMP", "TSA"],
          ]
        : [
            ["SHA", "GMP"],
            ["TSA", "GMP"],
          ];
    }

    for (const [dep, arr] of routeCandidates) {
      const pair =
        ROUTE_PAIRS[`${dep}-${arr}`];

      if (pair) {
        return pair;
      }
    }

    return null;
  }

  const regionMap: Record<string, string[]> = {
    "1-99": [
      "JFK",
      "LAX",
      "ORD",
      "SFO",
      "ATL",
      "IAD",
      "IAH",
    ],

    "100-199": [
      "SYD",
      "AKL",
      "BNE",
      "NAN",
    ],

    "200-299": [
      "LAX",
      "SFO",
      "LAS",
    ],

    "300-399": [
      "FRA",
      "CDG",
      "LHR",
      "AMS",
      "MXP",
      "FCO",
      "MAD",
      "VIE",
      "ZRH",
      "PRG",
      "IST",
      "LED",
      "SVO",
      "ARN",
    ],

    "400-499": [
      "DEL",
      "BOM",
      "CMB",
      "KTM",
      "TAS",
      "RUH",
      "AUH",
      "JED",
      "NBO",
      "TLV",
    ],

    "461-470": [
      "DAD",
      "SGN",
      "HAN",
      "CXR",
      "PNH",
      "REP",
      "RGN",
    ],

    "471-480": [
      "DEL",
      "BOM",
    ],

    "600-699": [
      "BKK",
      "CNX",
      "MNL",
      "SIN",
      "KUL",
      "HKT",
      "HKG",
      "DPS",
      "CGK",
      "CEB",
      "BKI",
      "PNH",
      "REP",
      "RGN",
      "ROR",
    ],

    "700-799": [
      "NRT",
      "HND",
      "KIX",
      "FUK",
      "NGO",
      "CTS",
      "OKA",
      "KIJ",
      "KMQ",
      "KOJ",
      "OIT",
      "OKJ",
    ],

    "800-899": [
      "PEK",
      "PVG",
      "SHA",
      "CAN",
      "CTU",
      "XIY",
      "DLC",
      "SHE",
      "HGH",
      "NKG",
      "TAO",
      "TSN",
      "CSX",
      "TNA",
      "TXN",
      "SZX",
      "KMG",
      "WUH",
      "XMN",
      "YNJ",
      "CGO",
    ],

    "900-999": [
      "CDG",
      "FRA",
      "LHR",
      "AMS",
      "MXP",
      "FCO",
      "MAD",
      "VIE",
      "ZRH",
      "PRG",
      "IST",
    ],
  };

  let destinations: string[] = [];

  if (num >= 1 && num <= 99) {
    destinations = regionMap["1-99"];
  } else if (
    num >= 100 &&
    num <= 199
  ) {
    destinations = regionMap["100-199"];
  } else if (
    num >= 200 &&
    num <= 299
  ) {
    destinations = regionMap["200-299"];
  } else if (
    num >= 300 &&
    num <= 399
  ) {
    destinations = regionMap["300-399"];
  } else if (
    num >= 461 &&
    num <= 470
  ) {
    destinations = regionMap["461-470"];
  } else if (
    num >= 471 &&
    num <= 499
  ) {
    destinations = regionMap["471-480"];
  } else if (
    num >= 600 &&
    num <= 699
  ) {
    destinations = regionMap["600-699"];
  } else if (
    num >= 700 &&
    num <= 799
  ) {
    destinations = regionMap["700-799"];
  } else if (
    num >= 800 &&
    num <= 899
  ) {
    destinations = regionMap["800-899"];
  } else if (
    num >= 900 &&
    num <= 999
  ) {
    destinations = regionMap["900-999"];
  }

  for (const destination of destinations) {
    const key = outbound
      ? `ICN-${destination}`
      : `${destination}-ICN`;

    const pair = ROUTE_PAIRS[key];

    if (pair) {
      return pair;
    }
  }

  return outbound
    ? {
        departure_iata: "ICN",
        arrival_iata: "UNKNOWN",
        aircraft_type: "Unknown",
      }
    : {
        departure_iata: "UNKNOWN",
        arrival_iata: "ICN",
        aircraft_type: "Unknown",
      };
}

/* -------------------------------------------------------------------------- */
/* Flightradar24 — timing supplement only                                    */
/* -------------------------------------------------------------------------- */

const FR24_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface Fr24Times {
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
}

async function fr24Times(
  fn: string,
): Promise<Fr24Times | null> {
  const url =
    `https://api.flightradar24.com/common/v1/flight/list.json` +
    `?query=${encodeURIComponent(fn)}` +
    `&fetchBy=flight&page=1&limit=10&format=json`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": FR24_UA,
        Accept: "application/json",
        "Accept-Language":
          "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) {
      return null;
    }

    const json =
      (await res.json()) as Record<
        string,
        unknown
      >;

    const rows =
      (json as any)?.result?.response?.data
        ?.item?.rows as
        | Record<string, unknown>[]
        | undefined;

    if (!rows?.length) {
      return null;
    }

    const row = rows[0];

    function toIso(
      epoch: unknown,
    ): string | null {
      if (!epoch) return null;

      const t =
        typeof epoch === "string"
          ? parseInt(epoch, 10)
          : Number(epoch);

      if (!isFinite(t) || t <= 0) {
        return null;
      }

      return new Date(
        t * 1000,
      ).toISOString();
    }

    const times = row.time as
      | Record<
          string,
          Record<string, unknown>
        >
      | undefined;

    return {
      scheduled_departure:
        toIso(times?.scheduled?.departure),

      scheduled_arrival:
        toIso(times?.scheduled?.arrival),

      estimated_departure:
        toIso(
          times?.estimated?.departure ??
            times?.real?.departure,
        ),

      estimated_arrival:
        toIso(
          times?.estimated?.arrival ??
            times?.real?.arrival,
        ),
    };
  } catch {
    return null;
  }
}

function applyFr24Times(
  target: Record<string, unknown>,
  fr24: Fr24Times | null,
): void {
  if (!fr24) {
    return;
  }

  /*
   * Only fill missing time fields.
   * Never replace authoritative KAC route data.
   */
  if (
    !target.scheduled_departure &&
    fr24.scheduled_departure
  ) {
    target.scheduled_departure =
      fr24.scheduled_departure;
  }

  if (
    !target.scheduled_arrival &&
    fr24.scheduled_arrival
  ) {
    target.scheduled_arrival =
      fr24.scheduled_arrival;
  }

  if (
    !target.estimated_departure &&
    fr24.estimated_departure
  ) {
    target.estimated_departure =
      fr24.estimated_departure;
  }

  if (
    !target.estimated_arrival &&
    fr24.estimated_arrival
  ) {
    target.estimated_arrival =
      fr24.estimated_arrival;
  }

  if (
    fr24.scheduled_departure ||
    fr24.scheduled_arrival ||
    fr24.estimated_departure ||
    fr24.estimated_arrival
  ) {
    target.time_source = "flightradar24";
  }
}

/* -------------------------------------------------------------------------- */
/* KAC — 1st priority: real-time GW                                          */
/* -------------------------------------------------------------------------- */

const KAC_GW_BASE =
  "https://apis.data.go.kr/B551178/flight-schedule";

const KAC_GW_MAX_PAGES = 5;
const KAC_GW_ROWS_PER_PAGE = 1000;

async function kacGwLookup(
  fn: string,
  serviceKey?: string,
): Promise<{
  flight: Record<string, unknown> | null;
  source: FlightSource | null;
  errors: Array<{
    stage: string;
    message: string;
  }>;
}> {
  const errors: Array<{
    stage: string;
    message: string;
  }> = [];

  if (!serviceKey) {
    errors.push({
      stage: "KAC_GW",
      message:
        "AIRPORTAL_SERVICE_KEY is not configured.",
    });

    return {
      flight: null,
      source: null,
      errors,
    };
  }

  const normalized =
    normalizeFlightNumber(fn);

  const flightCandidates =
    candidates(normalized);

  for (const suffix of ["/int", "/dom"]) {
    const source: FlightSource =
      suffix === "/int"
        ? "kac_gw_int"
        : "kac_gw_dom";

    let sourceHadSuccessfulResponse =
      false;

    for (
      let page = 1;
      page <= KAC_GW_MAX_PAGES;
      page++
    ) {
      const url =
        `${KAC_GW_BASE}${suffix}` +
        `?serviceKey=${encodeURIComponent(serviceKey)}` +
        `&pageNo=${page}` +
        `&numOfRows=${KAC_GW_ROWS_PER_PAGE}` +
        `&type=json`;

      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) {
          errors.push({
            stage: `KAC_GW${suffix}`,
            message:
              `HTTP ${res.status} on page ${page}.`,
          });
          continue;
        }

        const json =
          (await res.json()) as Record<
            string,
            unknown
          >;

        const resultCode =
          (json as any)?.response?.header
            ?.resultCode;

        if (
          resultCode &&
          String(resultCode) !== "00"
        ) {
          errors.push({
            stage: `KAC_GW${suffix}`,
            message:
              `API resultCode=${String(resultCode)}.`,
          });
          break;
        }

        const items =
          (json as any)?.response?.body
            ?.items?.item;

        if (!items) {
          sourceHadSuccessfulResponse = true;
          break;
        }

        const rows: Record<
          string,
          unknown
        >[] = Array.isArray(items)
          ? items
          : [items];

        if (!rows.length) {
          sourceHadSuccessfulResponse = true;
          break;
        }

        sourceHadSuccessfulResponse = true;

        for (const row of rows) {
          const flightId = firstValue(
            row,
            [
              "flightId",
              "flightNo",
              "flightNumber",
              "airFltNo",
              "airlineFlightNo",
              "fltNo",
            ],
          );

          if (!flightId) {
            continue;
          }

          const normalizedFlightId =
            normalizeFlightNumber(
              flightId,
            );

          if (
            !flightCandidates.includes(
              normalizedFlightId,
            )
          ) {
            continue;
          }

          const departure =
            normalizeAirportCode(
              firstValue(row, [
                "depAirportId",
                "departureAirportId",
                "departureIata",
                "departureAirport",
                "depAirport",
                "dep",
                "depIata",
              ]),
            );

          const arrival =
            normalizeAirportCode(
              firstValue(row, [
                "arrAirportId",
                "arrivalAirportId",
                "arrivalIata",
                "arrivalAirport",
                "arrAirport",
                "arr",
                "arrIata",
              ]),
            );

          const aircraftType =
            firstValue(row, [
              "aircraftType",
              "aircraft",
              "aircraftModel",
              "aircraftName",
              "aircraftCode",
            ]);

          const airline =
            firstValue(row, [
              "airlineIata",
              "airlineCode",
              "airline",
              "airlineId",
            ]);

          const flight: Record<
            string,
            unknown
          > = {
            flight_number: normalized,
            airline_iata:
              airline === "KAL"
                ? "KE"
                : airline ?? "KE",
            flight_iata:
              normalizedFlightId,

            departure_iata: departure,
            arrival_iata: arrival,

            scheduled_departure: null,
            scheduled_arrival: null,
            estimated_departure: null,
            estimated_arrival: null,

            aircraft_type:
              aircraftType,

            raw: {
              source:
                `kac_gw${suffix}`,
              page,
              ...row,
            },
          };

          /*
           * ROUTE_PAIRS may enrich aircraft type,
           * but it is NOT allowed to replace
           * the KAC route.
           */
          if (
            !flight.aircraft_type &&
            departure &&
            arrival
          ) {
            const pair =
              ROUTE_PAIRS[
                `${departure}-${arrival}`
              ];

            if (pair) {
              flight.aircraft_type =
                pair.aircraft_type;
            }
          }

          return {
            flight,
            source,
            errors,
          };
        }

        if (
          rows.length <
          KAC_GW_ROWS_PER_PAGE
        ) {
          break;
        }
      } catch (error) {
        errors.push({
          stage: `KAC_GW${suffix}`,
          message:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    if (!sourceHadSuccessfulResponse) {
      errors.push({
        stage: `KAC_GW${suffix}`,
        message:
          "No successful response received.",
      });
    }
  }

  return {
    flight: null,
    source: null,
    errors,
  };
}

/* -------------------------------------------------------------------------- */
/* KAC — 2nd priority: international CSV                                    */
/* -------------------------------------------------------------------------- */

function kacInternationalCsvLookup(
  fn: string,
): Record<string, unknown> | null {
  const normalized =
    normalizeFlightNumber(fn);

  let match:
    | {
        airline: string;
        dep: string;
        arr: string;
        [key: string]: unknown;
      }
    | undefined;

  let matchedFlight =
    normalized;

  for (const candidate of candidates(
    normalized,
  )) {
    const found =
      KAC_CSV_SCHEDULE[candidate];

    if (found) {
      match = found;
      matchedFlight = candidate;
      break;
    }
  }

  if (!match) {
    return null;
  }

  const departure =
    normalizeAirportCode(match.dep);

  const arrival =
    normalizeAirportCode(match.arr);

  const airline =
    match.airline === "KAL"
      ? "KE"
      : match.airline === "AAR"
        ? "OZ"
        : match.airline;

  const result: Record<
    string,
    unknown
  > = {
    flight_number: normalized,
    airline_iata: airline,
    flight_iata: matchedFlight,

    departure_iata: departure,
    arrival_iata: arrival,

    scheduled_departure: null,
    scheduled_arrival: null,
    estimated_departure: null,
    estimated_arrival: null,

    aircraft_type: null,

    raw: {
      source:
        "kac_international_csv",
      ...match,
    },
  };

  /*
   * ROUTE_PAIRS is only enrichment here.
   * It cannot replace CSV route information.
   */
  if (departure && arrival) {
    const pair =
      ROUTE_PAIRS[
        `${departure}-${arrival}`
      ];

    if (pair) {
      result.aircraft_type =
        pair.aircraft_type;
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* getFlight — strict source priority                                        */
/* -------------------------------------------------------------------------- */

export async function getFlight(
  fn: string,
  _apiKey?: string,
  airportalKey?: string,
): Promise<
  [
    Record<string, unknown>,
    string | null,
  ]
> {
  const normalized =
    normalizeFlightNumber(fn);

  if (!normalized) {
    return [
      {
        flight_number: "",
        airline_iata: null,
        flight_iata: null,
        departure_iata: null,
        arrival_iata: null,
        scheduled_departure: null,
        scheduled_arrival: null,
        estimated_departure: null,
        estimated_arrival: null,
        aircraft_type: null,
        source: "invalid_input",
        raw: {},
      },
      "Flight number is empty or invalid.",
    ];
  }

  /* ====================================================================== */
  /* 1. KAC REAL-TIME GW                                                    */
  /* ====================================================================== */

  const kacResult =
    await kacGwLookup(
      normalized,
      airportalKey,
    );

  if (kacResult.flight) {
    const fr24 =
      await fr24Times(normalized);

    applyFr24Times(
      kacResult.flight,
      fr24,
    );

    kacResult.flight.source =
      kacResult.source;

    return [
      kacResult.flight,
      null,
    ];
  }

  /* ====================================================================== */
  /* 2. KAC INTERNATIONAL CSV                                               */
  /* ====================================================================== */

  try {
    const csvFlight =
      kacInternationalCsvLookup(
        normalized,
      );

    if (csvFlight) {
      const fr24 =
        await fr24Times(normalized);

      applyFr24Times(
        csvFlight,
        fr24,
      );

      csvFlight.source =
        "kac_international_csv";

      return [
        csvFlight,
        null,
      ];
    }
  } catch (error) {
    kacResult.errors.push({
      stage:
        "KAC_INTERNATIONAL_CSV",
      message:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }

  /* ====================================================================== */
  /* 3. ROUTE_PAIRS FINAL FALLBACK                                          */
  /* ====================================================================== */

  const keGuess =
    guessKeRoute(normalized);

  const hasRoute =
    !!keGuess &&
    keGuess.departure_iata !==
      "UNKNOWN" &&
    keGuess.arrival_iata !==
      "UNKNOWN";

  const fallback: Record<
    string,
    unknown
  > = {
    flight_number: normalized,
    airline_iata:
      normalized.startsWith("KE")
        ? "KE"
        : normalized.slice(0, 2),

    flight_iata: normalized,

    departure_iata: hasRoute
      ? keGuess!.departure_iata
      : null,

    arrival_iata: hasRoute
      ? keGuess!.arrival_iata
      : null,

    scheduled_departure: null,
    scheduled_arrival: null,
    estimated_departure: null,
    estimated_arrival: null,

    aircraft_type: hasRoute
      ? keGuess!.aircraft_type
      : null,

    source:
      "route_pairs_fallback",

    raw: {
      source:
        "route_pairs_fallback",
      ...keGuess,
    },
  };

  /*
   * FR24 can supplement times,
   * but can NEVER determine the route.
   */
  const fr24 =
    await fr24Times(normalized);

  applyFr24Times(
    fallback,
    fr24,
  );

  if (hasRoute) {
    return [
      fallback,
      `Route information for ${normalized} not found in schedule database. Using fallback: ${keGuess!.departure_iata}→${keGuess!.arrival_iata}.`,
    ];
  }

  return [
    fallback,
    `Route information for ${normalized} not found in schedule database.`,
  ];
}
