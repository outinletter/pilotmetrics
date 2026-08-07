import type { Source } from "../types";

export const SOURCES: Source[] = [
  { name: "FAA Safety Briefing", url: "https://www.faa.gov/newsroom/faa-safety-briefing-magazine", category: "Training", tags: ["FAA", "Safety Briefing", "Part 121", "Part 135", "Training"] },
  { name: "FAA Regulations and Policies", url: "https://www.faa.gov/regulations_policies", category: "Regulation", tags: ["FAA", "Regulation", "FAR", "SMS", "FOQA"] },
  { name: "NTSB Aviation Investigations", url: "https://www.ntsb.gov/investigations/Pages/aviation.aspx", category: "Accident / Incident", tags: ["NTSB", "Accident", "Incident", "Safety Recommendation"] },
  { name: "NASA ASRS", url: "https://asrs.arc.nasa.gov/", category: "Human Factors / CRM", tags: ["ASRS", "Human Factors", "CRM", "Fatigue"] },
  { name: "Flight Safety Foundation", url: "https://flightsafety.org/", category: "Flight Operations", tags: ["Safety", "Operations", "Training"] },
  { name: "ICAO Safety", url: "https://www.icao.int/safety-reports", category: "Flight Operations", tags: ["ICAO", "Safety", "Global"] },
  { name: "EASA Safety Publications", url: "https://www.easa.europa.eu/en/domains/safety-management/safety-publications", category: "Regulation", tags: ["EASA", "Safety", "Regulation"] },
  { name: "EASA Accident Investigation", url: "https://www.easa.europa.eu/en/domains/accident-investigation", category: "Accident / Incident", tags: ["EASA", "Accident", "Investigation"] },
  { name: "SKYbrary", url: "https://skybrary.aero/accidents-and-incidents", category: "Accident / Incident", tags: ["Operational Lessons", "Training", "Threat and Error Management"] },
  { name: "SKYbrary Articles", url: "https://skybrary.aero/articles", category: "Training", tags: ["Operational Lessons", "Training", "Procedures"] },
  { name: "Aviation Week", url: "https://aviationweek.com/", category: "Industry Trends", tags: ["Industry", "Fleet", "Operations"] },
  { name: "The Air Current", url: "https://theaircurrent.com/", category: "Industry Trends", tags: ["Industry", "Operations", "Analysis"] },
  // ── 사고 조사 기관 ─────────────────────────────────────────
  { name: "ASN Aviation Safety Network", url: "https://aviation-safety.net/database/", category: "Accident / Incident", tags: ["ASN", "Accident", "Global", "Jet"] },
  { name: "AAIB Reports", url: "https://www.gov.uk/aaib-reports", category: "Accident / Incident", tags: ["AAIB", "UK", "Accident", "Investigation"] },
  { name: "BEA France", url: "https://bea.aero/en/investigation-reports/notified-accidents-and-serious-incidents/", category: "Accident / Incident", tags: ["BEA", "France", "Accident", "Investigation"] },
  { name: "ATSB Aviation", url: "https://www.atsb.gov.au/aviation/", category: "Accident / Incident", tags: ["ATSB", "Australia", "Accident", "Investigation"] },
  { name: "TSB Canada Aviation", url: "https://www.tsb.gc.ca/eng/rapports-reports/aviation/", category: "Accident / Incident", tags: ["TSB", "Canada", "Accident", "Investigation"] },
  { name: "JTSB Japan", url: "https://www.mlit.go.jp/jtsb/aviation.html", category: "Accident / Incident", tags: ["JTSB", "Japan", "Accident", "Investigation"] },
  // ── 추가 안전 자료 ─────────────────────────────────────────
  { name: "FAA Lessons Learned", url: "https://lessonslearned.faa.gov/", category: "Accident / Incident", tags: ["FAA", "Lessons Learned", "Accident"] },
  { name: "Flight Safety Foundation AeroSafety", url: "https://flightsafety.org/publications-standards/aerosafetyworld/", category: "Flight Operations", tags: ["FSF", "Safety", "Operations"] },
  { name: "NASA ASRS Callback", url: "https://asrs.arc.nasa.gov/publications/callback.html", category: "Human Factors / CRM", tags: ["ASRS", "CALLBACK", "Human Factors"] },
];
