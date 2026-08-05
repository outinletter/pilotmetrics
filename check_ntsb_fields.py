import asyncio
import json

import httpx

from src.services.official_event_parsers import fetch_ntsb_carol_cases


async def main():
    async with httpx.AsyncClient(timeout=60) as client:
        cases = await fetch_ntsb_carol_cases(client, "2026-07-01", "2026-07-21")
    if not cases:
        print("no cases returned")
        return
    case = cases[0]
    print("keys:", sorted(case.keys()))
    print()
    print(json.dumps(case, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
