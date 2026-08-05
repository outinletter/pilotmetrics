export function riskLevel(tags: string[]): "HIGH" | "MEDIUM" | "LOW" {
  const t = new Set(tags);
  const high = new Set(["WINDSHEAR","TSRA","CB","LOW_VISIBILITY","HEAVY_RAIN"]);
  const medium = new Set(["WET_RWY","GUST","TAILWIND","CROSSWIND","FOG"]);
  const highHits = [...high].filter(x => t.has(x));
  if (highHits.length >= 2 || t.has("WINDSHEAR")) return "HIGH";
  if (highHits.length > 0 || [...medium].some(x => t.has(x))) return "MEDIUM";
  return "LOW";
}

export function threatForTags(tags: Set<string>): [string, string] {
  if (tags.has("WET_RWY")) return ["Wet Runway Landing Performance", "Wet runway and convective weather may reduce landing performance margin."];
  if (tags.has("CONVECTIVE_WEATHER") || tags.has("TSRA") || tags.has("CB")) return ["Convective Weather Near Final Approach", "Thunderstorm cells near final can rapidly reduce path, speed, and wind margin."];
  if (tags.has("UNSTABLE_APPROACH_RISK")) return ["Unstable Approach and Late Go-Around", "High workload conditions increase continuation bias below stable approach gates."];
  if (tags.has("GPS_INTEGRITY")) return ["RNAV and GPS Integrity", "Navigation integrity changes require a briefed backup approach and early reconfiguration."];
  if (tags.has("ETOPS")) return ["Long-Haul Diversion and System Margin", "Long-haul sectors need early fuel, system, and alternate decision gates."];
  return ["Route-Based Operational Threat", "Similar route events suggest a targeted prevention review."];
}
