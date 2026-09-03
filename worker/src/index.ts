app.get("/api/briefing/:flightNumber", async c => {
  const raw = c.req.param("flightNumber").toUpperCase().trim();

  const errors: Array<{
    stage: string;
    error: string;
  }> = [];

  const messages: string[] = [];

  const recordError = (
    stage: string,
    error: unknown,
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `[BRIEFING:${stage}]`,
      message,
    );

    errors.push({
      stage,
      error: message,
    });
  };

  try {
    /* ==================================================================== */
    /* Airport direct search                                                 */
    /* ==================================================================== */

    if (
      /^[A-Z]{3}$/.test(raw) ||
      /^[A-Z]{4}$/.test(raw)
    ) {
      let arrIcao =
        raw.length === 4
          ? raw
          : iataToIcao(raw);

      let arrIata =
        raw.length === 3
          ? raw
          : icaoToIata(raw);

      let weather = {
        metar: "",
        taf: "",
      };

      let weatherMessages: string[] =
        [];

      /* WEATHER */
      try {
        if (arrIcao) {
          [
            weather,
            weatherMessages,
          ] = await getWeather(arrIcao);
        }
      } catch (error) {
        recordError(
          "WEATHER",
          error,
        );
        weatherMessages = [
          "Weather data unavailable.",
        ];
      }

      const fixedRisks =
        airportFixedRisks(arrIcao);

      const tags = [
        ...new Set([
          ...parseWeatherTags(
            weather.metar,
            weather.taf,
            arrIcao,
          ),
          ...fixedRisks,
        ]),
      ];

      /* D1 EVENT COUNT */
      let airportEventCount = 0;

      try {
        if (arrIcao) {
          airportEventCount =
            (
              await c.env.DB
                .prepare(
                  "SELECT COUNT(*) as n FROM events WHERE airport_icao = ? OR airport_iata = ?",
                )
                .bind(
                  arrIcao,
                  arrIata,
                )
                .first<{ n: number }>()
            )?.n ?? 0;
        }
      } catch (error) {
        recordError(
          "D1_EVENT_COUNT",
          error,
        );
      }

      const score = riskScore(
        tags,
        airportEventCount,
      );

      const level = riskLevel(
        tags,
        airportEventCount,
      );

      const context: Record<
        string,
        unknown
      > = {
        flight_number: raw,
        route: `— → ${raw}`,
        aircraft: "Airport Search",
        departure_icao: "",
        arrival_icao: arrIcao,
        departure_iata: "",
        arrival_iata: arrIata,
        destination_runway: null,
        weather:
          tags.join("/") ||
          "CLEAR",
        risk_score: score,
        risk_level: level,
        risk_summary: riskSummary(
          score,
          level,
          tags,
        ),
        risk_breakdown:
          riskBreakdown(
            tags,
            airportEventCount,
          ),
        arrival_weather_brief:
          arrivalWeatherBrief(
            weather.taf,
            weather.metar,
            null,
            0,
          ),
        airport_event_count:
          airportEventCount,
        messages: [
          ...weatherMessages,
        ],
        arrival_weather_time: null,
        metar: weather.metar,
        taf: weather.taf,
        arrival_taf: weather.taf,
        arrival_tags: tags,
        metar_tags: tags,
      };

      let threats: any[] = [];
      let notamThreats: any[] = [];

      /* THREAT ENGINE */
      try {
        threats =
          await buildThreats(
            c.env.DB,
            context,
            tags,
            c.env.AI,
          );
      } catch (error) {
        recordError(
          "BUILD_THREATS",
          error,
        );
      }

      /* NOTAM */
      try {
        const hasNotam =
          !!arrIcao &&
          !!(
            c.env.NMS_CLIENT_ID ||
            c.env.FAA_NOTAM_API_KEY
          );

        if (hasNotam) {
          notamThreats =
            await fetchNotamThreats(
              arrIcao!,
              null,
              {
                nmsClientId:
                  c.env.NMS_CLIENT_ID,
                nmsClientSecret:
                  c.env.NMS_CLIENT_SECRET,
                nmsEnv:
                  c.env.NMS_ENV,
                legacyKey:
                  c.env.FAA_NOTAM_API_KEY,
              },
            );
        }
      } catch (error) {
        recordError(
          "NOTAM",
          error,
        );
      }

      context.messages = [
        ...weatherMessages,
        ...errors.map(
          e =>
            `${e.stage}: ${e.error}`,
        ),
      ];

      return c.json({
        ok: errors.length === 0,
        flight_context: context,
        top_threats: threats,
        notam_threats:
          notamThreats,
        error_stage:
          errors.length > 0
            ? errors[0].stage
            : null,
        errors,
      });
    }

    /* ==================================================================== */
    /* Flight number search                                                 */
    /* ==================================================================== */

    const fn =
      normalizeFlightNumber(raw);

    /* FLIGHT LOOKUP */
    let flight: Record<
      string,
      any
    >;

    let flightMsg:
      | string
      | null = null;

    try {
      [
        flight,
        flightMsg,
      ] = await getFlight(
        fn,
        c.env.AVIATIONSTACK_API_KEY,
        c.env.AIRPORTAL_SERVICE_KEY,
      );
    } catch (error) {
      recordError(
        "GET_FLIGHT",
        error,
      );

      flight = {
        flight_number: fn,
        airline_iata:
          fn.slice(0, 2),
        flight_iata: fn,
        departure_iata: null,
        arrival_iata: null,
        scheduled_departure:
          null,
        scheduled_arrival: null,
        estimated_departure:
          null,
        estimated_arrival:
          null,
        aircraft_type: null,
        source:
          "flight_lookup_error",
        raw: {},
      };

      flightMsg =
        `Flight lookup failed: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`;
    }

    if (flightMsg) {
      messages.push(flightMsg);
    }

    /* AIRPORT CODES */
    let depIcao:
      | string
      | null = null;

    let arrIcao:
      | string
      | null = null;

    try {
      depIcao =
        flight.departure_iata
          ? iataToIcao(
              flight.departure_iata as string,
            )
          : null;

      arrIcao =
        flight.arrival_iata
          ? iataToIcao(
              flight.arrival_iata as string,
            )
          : null;
    } catch (error) {
      recordError(
        "AIRPORT_CODE",
        error,
      );
    }

    const depIata =
      (flight.departure_iata as string) ??
      "UNKNOWN";

    const arrIata =
      (flight.arrival_iata as string) ??
      "UNKNOWN";

    /* WEATHER */
    let weather = {
      metar: "",
      taf: "",
    };

    let weatherMessages: string[] =
      [];

    try {
      if (arrIcao) {
        [
          weather,
          weatherMessages,
        ] = await getWeather(arrIcao);
      }
    } catch (error) {
      recordError(
        "WEATHER",
        error,
      );

      weatherMessages = [
        "Weather data unavailable.",
      ];
    }

    const arrivalTime =
      (flight.estimated_arrival ??
        flight.scheduled_arrival) as
        | string
        | null;

    let arrivalTaf = "";

    try {
      arrivalTaf =
        selectArrivalTafSegment(
          weather.taf,
          arrivalTime,
        );
    } catch (error) {
      recordError(
        "TAF_SEGMENT",
        error,
      );

      arrivalTaf =
        weather.taf ?? "";
    }

    /* AIRPORT FIXED RISKS */
    let fixedRisks: string[] =
      [];

    try {
      fixedRisks =
        airportFixedRisks(arrIcao);
    } catch (error) {
      recordError(
        "AIRPORT_HAZARDS",
        error,
      );
    }

    const arrivalDate =
      arrivalTime
        ? new Date(arrivalTime)
        : new Date();

    let utcOffset = 0;

    try {
      utcOffset =
        airportUtcOffset(
          arrIcao,
          arrivalDate,
        );
    } catch (error) {
      recordError(
        "UTC_OFFSET",
        error,
      );
    }

    let nightArr = false;

    try {
      nightArr =
        isNightArrival(
          arrivalTime,
          utcOffset,
        );
    } catch (error) {
      recordError(
        "NIGHT_ARRIVAL",
        error,
      );
    }

    /* WEATHER TAGS */
    let arrivalTags: string[] =
      [];
    let metarTags: string[] =
      [];
    let tags: string[] = [];

    try {
      arrivalTags = [
        ...new Set([
          ...parseWeatherTags(
            "",
            arrivalTaf,
            arrIcao,
          ),
          ...fixedRisks,
        ]),
      ];

      metarTags =
        parseWeatherTags(
          weather.metar,
          "",
          arrIcao,
        );

      tags = [
        ...new Set([
          ...parseWeatherTags(
            weather.metar,
            arrivalTaf,
            arrIcao,
          ),
          ...fixedRisks,
        ]),
      ];
    } catch (error) {
      recordError(
        "WEATHER_TAGS",
        error,
      );
    }

    /* D1 EVENT COUNT */
    let airportEventCount = 0;

    try {
      if (arrIcao) {
        airportEventCount =
          (
            await c.env.DB
              .prepare(
                "SELECT COUNT(*) as n FROM events WHERE airport_icao = ? OR airport_iata = ?",
              )
              .bind(
                arrIcao,
                arrIata,
              )
              .first<{ n: number }>()
          )?.n ?? 0;
      }
    } catch (error) {
      recordError(
        "D1_EVENT_COUNT",
        error,
      );
    }

    const activeTags =
      arrivalTags.length >
      fixedRisks.length
        ? arrivalTags
        : tags;

    let score = 0;
    let level = "LOW";

    try {
      score = riskScore(
        activeTags,
        airportEventCount,
        nightArr,
      );

      level = riskLevel(
        activeTags,
        airportEventCount,
        nightArr,
      );
    } catch (error) {
      recordError(
        "RISK_SCORE",
        error,
      );
    }

    let arrivalWeatherBriefText =
      "";

    try {
      arrivalWeatherBriefText =
        arrivalWeatherBrief(
          arrivalTaf,
          weather.metar,
          arrivalTime,
          utcOffset,
        );
    } catch (error) {
      recordError(
        "ARRIVAL_WEATHER_BRIEF",
        error,
      );
    }

    const context: Record<
      string,
      unknown
    > = {
      flight_number: fn,

      route:
        `${depIata}-${arrIata}`,

      aircraft:
        (flight.aircraft_type as string) ??
        "Unknown",

      departure_icao:
        depIcao,

      arrival_icao:
        arrIcao,

      departure_iata:
        depIata,

      arrival_iata:
        arrIata,

      destination_runway:
        null,

      weather:
        tags.join("/") ||
        "CLEAR",

      risk_score:
        score,

      risk_level:
        level,

      risk_summary:
        riskSummary(
          score,
          level,
          activeTags,
          nightArr,
        ),

      risk_breakdown:
        riskBreakdown(
          activeTags,
          airportEventCount,
          nightArr,
        ),

      arrival_weather_brief:
        arrivalWeatherBriefText,

      night_arrival:
        nightArr,

      airport_event_count:
        airportEventCount,

      messages: [
        ...messages,
        ...weatherMessages,
      ].filter(Boolean),

      arrival_weather_time:
        arrivalTime,

      scheduled_departure:
        flight.scheduled_departure ??
        null,

      scheduled_arrival:
        flight.scheduled_arrival ??
        null,

      estimated_departure:
        flight.estimated_departure ??
        null,

      estimated_arrival:
        flight.estimated_arrival ??
        null,

      metar:
        weather.metar,

      taf:
        weather.taf,

      arrival_taf:
        arrivalTaf,

      arrival_tags:
        arrivalTags,

      metar_tags:
        metarTags,

      flight_source:
        flight.source ??
        "unknown",
    };

    if (flightMsg) {
      const enc = (
        q: string,
      ) =>
        encodeURIComponent(q);

      context.flight_search_links = [
        {
          label:
            `${fn} flight status`,
          url:
            `https://www.google.com/search?q=${enc(
              `${fn} flight status`,
            )}`,
        },
        {
          label:
            `${fn} ${context.route} today flight`,
          url:
            `https://www.google.com/search?q=${enc(
              `${fn} ${context.route} today flight`,
            )}`,
        },
      ];
    }

    /* ==================================================================== */
    /* Persist flight query                                                  */
    /* ==================================================================== */

    try {
      c.env.DB.prepare(
        `INSERT INTO flight_queries
        (flight_number,airline_iata,flight_iata,
         departure_iata,arrival_iata,
         departure_icao,arrival_icao,
         scheduled_departure,scheduled_arrival,
         estimated_departure,estimated_arrival,
         aircraft_type,raw_response_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          fn,
          flight.airline_iata ??
            null,
          flight.flight_iata ??
            null,
          depIata,
          arrIata,
          depIcao,
          arrIcao,
          flight.scheduled_departure ??
            null,
          flight.scheduled_arrival ??
            null,
          flight.estimated_departure ??
            null,
          flight.estimated_arrival ??
            null,
          flight.aircraft_type ??
            null,
          JSON.stringify(
            flight.raw ?? {},
          ),
        )
        .run()
        .catch(error => {
          console.error(
            "[BRIEFING:FLIGHT_QUERY_PERSIST]",
            error,
          );
        });
    } catch (error) {
      recordError(
        "FLIGHT_QUERY_PERSIST",
        error,
      );
    }

    /* ==================================================================== */
    /* Threat engine                                                         */
    /* ==================================================================== */

    let threats: any[] = [];

    try {
      threats =
        await buildThreats(
          c.env.DB,
          context,
          tags,
          c.env.AI,
        );
    } catch (error) {
      recordError(
        "BUILD_THREATS",
        error,
      );
    }

    /* ==================================================================== */
    /* NOTAM                                                                  */
    /* ==================================================================== */

    let notamThreats: any[] =
      [];

    try {
      const hasNotam =
        !!arrIcao &&
        !!(
          c.env.NMS_CLIENT_ID ||
          c.env.FAA_NOTAM_API_KEY
        );

      if (hasNotam) {
        notamThreats =
          await fetchNotamThreats(
            arrIcao!,
            arrivalTime,
            {
              nmsClientId:
                c.env.NMS_CLIENT_ID,
              nmsClientSecret:
                c.env.NMS_CLIENT_SECRET,
              nmsEnv:
                c.env.NMS_ENV,
              legacyKey:
                c.env.FAA_NOTAM_API_KEY,
            },
          );
      }
    } catch (error) {
      recordError(
        "NOTAM",
        error,
      );
    }

    /* ==================================================================== */
    /* Background enrichment                                                 */
    /* ==================================================================== */

    if (
      c.env.AI &&
      threats.length > 0
    ) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const eventIds =
              (threats as any[])
                .flatMap(
                  g =>
                    g.events.map(
                      (e: any) =>
                        e.id,
                    ),
                );

            if (
              eventIds.length === 0
            ) {
              return;
            }

            const {
              results,
            } =
              await c.env.DB.prepare(
                `SELECT id, summary, flight_phase
                 FROM events
                 WHERE id IN (${eventIds
                   .map(() => "?")
                   .join(",")})
                 AND (
                   contributing_factors IS NULL
                   OR contributing_factors = '[]'
                 )`,
              )
                .bind(...eventIds)
                .all<{
                  id: string;
                  summary: string;
                  flight_phase:
                    | string
                    | null;
                }>();

            if (
              results.length > 0
            ) {
              await enrichEventsWithThreats(
                c.env.AI,
                c.env.DB,
                10,
                results.map(
                  r => r.id,
                ),
              );
            }
          } catch (error) {
            console.error(
              "[BRIEFING:BACKGROUND_ENRICHMENT]",
              error,
            );
          }
        })(),
      );
    }

    /* ==================================================================== */
    /* Final response                                                        */
    /* ==================================================================== */

    context.messages = [
      ...messages,
      ...weatherMessages,
      ...errors.map(
        e =>
          `${e.stage}: ${e.error}`,
      ),
    ].filter(Boolean);

    return c.json({
      ok: errors.length === 0,

      flight_context:
        context,

      top_threats:
        threats,

      notam_threats:
        notamThreats,

      error_stage:
        errors.length > 0
          ? errors[0].stage
          : null,

      errors,
    });
  } catch (error) {
    recordError(
      "BRIEFING_UNHANDLED",
      error,
    );

    return c.json(
      {
        ok: false,

        flight_context: {
          flight_number: raw,
          route: "UNKNOWN-UNKNOWN",
          aircraft: "Unknown",
          messages:
            errors.map(
              e =>
                `${e.stage}: ${e.error}`,
            ),
        },

        top_threats: [],
        notam_threats: [],

        error_stage:
          "BRIEFING_UNHANDLED",

        errors,
      },
      200,
    );
  }
});
