#!/usr/bin/env python3
"""
Measure value-source coverage across real Sleeper leagues.

This is the objective half of the Phase 3 decision gate (see
docs/features/xomper-rebrand/PLAN.md): how much of a real roster can we
actually price, per league type. Believability stays a human call; coverage is
measurable, and this measures it.

It mirrors the app rather than reimplementing it:
  - fingerprint()  mirrors LeagueSettingsFingerprintService.resolve()
  - source routing mirrors CompositeValueProvider (dynasty -> FantasyCalc,
    redraft -> Sleeper projections)

Keep the two in step. If the fingerprint axes change in the app, change them
here, or this reports on a format the app no longer uses.

Usage
-----
    # discover leagues from the members of a known league, then measure
    python3 tools/coverage-report.py --from-league 1317249551823814656

    # or measure specific leagues
    python3 tools/coverage-report.py 1317249551823814656 1389342475826520064

    --season   defaults to the current NFL season from /state/nfl
    --json     emit raw results instead of a table
"""
import argparse
import json
import sys
import time
import urllib.request

SLEEPER = "https://api.sleeper.app/v1"
PROJECTIONS = "https://api.sleeper.com/projections/nfl"
FANTASYCALC = "https://api.fantasycalc.com/values/current"

# api.sleeper.com returns nothing for the default urllib agent. Without this
# every redraft league silently measures 0% coverage, because the projections
# pool comes back empty and an empty pool matches nothing. Cost a real
# debugging cycle on 2026-08-25; do not remove.
USER_AGENT = "xomper-coverage-report/1.0"

IDP_SLOTS = {"DL", "LB", "DB", "IDP_FLEX", "DE", "DT", "CB", "S", "IDP"}
SUPPORTED_TEAMS = [8, 10, 12, 14, 16]
SUPPORTED_PPR = [0, 0.5, 1]
VALUED_POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")


def get(url, tries=3):
    for attempt in range(tries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode())
        except Exception:
            if attempt == tries - 1:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def nearest(value, options):
    return min(options, key=lambda o: abs(o - value))


def fingerprint(league):
    """Mirrors LeagueSettingsFingerprintService.resolve()."""
    roster_positions = league.get("roster_positions") or []
    scoring = league.get("scoring_settings") or {}
    settings = league.get("settings") or {}
    league_type = settings.get("type", 2)

    superflex = any(p.upper() == "SUPER_FLEX" for p in roster_positions)
    qb_slots = sum(1 for p in roster_positions if p.upper() == "QB")

    requested_teams = league.get("total_rosters") or 12
    requested_ppr = scoring.get("rec", 0) or 0

    unsupported = []
    idp = sorted({p.upper() for p in roster_positions if p.upper() in IDP_SLOTS})
    if idp:
        unsupported.append("IDP:" + ",".join(idp))
    if settings.get("best_ball") == 1:
        unsupported.append("best-ball")

    return {
        "isDynasty": league_type != 0,
        "isKeeper": league_type == 1,
        "numQbs": 2 if (superflex or qb_slots >= 2) else 1,
        "numTeams": nearest(requested_teams, SUPPORTED_TEAMS),
        "ppr": nearest(requested_ppr, SUPPORTED_PPR),
        "teBonus": scoring.get("bonus_rec_te", 0) or 0,
        "requestedTeams": requested_teams,
        "requestedPpr": requested_ppr,
        "unsupported": unsupported,
    }


def league_kind(fp):
    if not fp["isDynasty"]:
        return "redraft"
    return "keeper" if fp["isKeeper"] else "dynasty"


_projection_cache = {}


def projection_ids(season):
    """Player ids with a non-zero projection.

    Note the filter. The endpoint returns ~3,300 entries but most project zero
    and cannot be valued; the usable pool is closer to 640. Counting raw
    entries overstates coverage capability considerably.
    """
    if season in _projection_cache:
        return _projection_cache[season]
    positions = "&".join(f"position[]={p}" for p in VALUED_POSITIONS)
    data = get(f"{PROJECTIONS}/{season}?season_type=regular&{positions}")
    if data is None:
        raise SystemExit(
            "projections request failed. An empty pool would report every "
            "redraft league as 0% coverage, so this is fatal rather than empty."
        )
    ids = {
        str(entry["player_id"])
        for entry in data
        if (entry.get("stats") or {}).get("pts_ppr")
        or (entry.get("stats") or {}).get("pts_std")
    }
    _projection_cache[season] = ids
    return ids


_fantasycalc_cache = {}


def fantasycalc_ids(fp):
    key = (fp["isDynasty"], fp["numQbs"], fp["numTeams"], fp["ppr"])
    if key in _fantasycalc_cache:
        return _fantasycalc_cache[key]
    url = (
        f"{FANTASYCALC}?isDynasty={str(fp['isDynasty']).lower()}"
        f"&numQbs={fp['numQbs']}&numTeams={fp['numTeams']}&ppr={fp['ppr']}"
    )
    data = get(url) or []
    ids = {
        str(e["player"]["sleeperId"])
        for e in data
        if (e.get("player") or {}).get("sleeperId")
    }
    _fantasycalc_cache[key] = ids
    return ids


def measure(league_id, season):
    league = get(f"{SLEEPER}/league/{league_id}")
    if not league:
        return None

    fp = fingerprint(league)
    rosters = get(f"{SLEEPER}/league/{league_id}/rosters") or []

    # CompositeValueProvider routing.
    #   redraft -> projections
    #   keeper  -> union of both, blended by keeper depth
    #   dynasty -> FantasyCalc
    if not fp["isDynasty"]:
        source, priced = "projections", projection_ids(season)
    elif fp["isKeeper"]:
        source = "keeper-blend"
        priced = fantasycalc_ids(fp) | projection_ids(season)
    else:
        source, priced = "fantasycalc", fantasycalc_ids(fp)

    rostered = starters_total = 0
    valued = starters_valued = 0
    unpriced = []

    for roster in rosters:
        starters = set(roster.get("starters") or [])
        for pid in roster.get("players") or []:
            if not pid:
                continue
            rostered += 1
            hit = str(pid) in priced
            valued += hit
            if not hit:
                unpriced.append(str(pid))
            if pid in starters:
                starters_total += 1
                starters_valued += hit

    return {
        "id": league_id,
        "name": league.get("name"),
        "season": league.get("season"),
        "status": league.get("status"),
        "teams": league.get("total_rosters"),
        "kind": league_kind(fp),
        "fingerprint": fp,
        "source": source,
        "sourcePool": len(priced),
        "rostered": rostered,
        "valued": valued,
        "startersTotal": starters_total,
        "startersValued": starters_valued,
        "rosterCoverage": (valued / rostered) if rostered else None,
        "starterCoverage": (starters_valued / starters_total) if starters_total else None,
        "unpricedSample": sorted(set(unpriced))[:12],
    }


def discover(anchor_league_id, season):
    """League ids reachable from the members of a known league."""
    users = get(f"{SLEEPER}/league/{anchor_league_id}/users") or []
    found = {}
    for user in users:
        uid = user.get("user_id")
        if not uid:
            continue
        leagues = get(f"{SLEEPER}/user/{uid}/leagues/nfl/{season}")
        if isinstance(leagues, list):
            for lg in leagues:
                found[lg["league_id"]] = lg
        time.sleep(0.3)
    return list(found)


def render(results):
    drafted = [r for r in results if r["rostered"] > 0]
    pending = [r for r in results if r["rostered"] == 0]

    header = f"{'league':<30}{'type':>8}{'tm':>4}{'source':>12}{'pool':>6}{'roster':>9}{'start':>7}"
    print(header)
    print("-" * len(header))
    for r in sorted(drafted, key=lambda r: (r["kind"], -(r["rosterCoverage"] or 0))):
        print(
            f"{(r['name'] or '')[:29]:<30}{r['kind']:>8}{r['teams']:>4}"
            f"{r['source']:>12}{r['sourcePool']:>6}"
            f"{r['rosterCoverage'] * 100:>8.0f}%{r['starterCoverage'] * 100:>6.0f}%"
        )

    print()
    for kind in ("redraft", "keeper", "dynasty"):
        group = [r for r in drafted if r["kind"] == kind]
        if not group:
            continue
        roster = sum(r["rosterCoverage"] for r in group) / len(group) * 100
        starters = sum(r["starterCoverage"] for r in group) / len(group) * 100
        worst = min(group, key=lambda r: r["rosterCoverage"])
        print(
            f"{kind:>8}: n={len(group)}  roster {roster:5.1f}%  starters {starters:5.1f}%"
            f"   worst: {(worst['name'] or '')[:24]} {worst['rosterCoverage'] * 100:.0f}%"
        )

    if pending:
        print()
        print("not drafted yet, excluded from averages:")
        for r in pending:
            print(f"  {(r['name'] or '')[:30]:<32} [{r['status']}]")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("leagues", nargs="*", help="league ids to measure")
    parser.add_argument("--from-league", help="discover leagues via this league's members")
    parser.add_argument("--season", help="defaults to current NFL season")
    parser.add_argument("--json", action="store_true", help="emit raw JSON")
    args = parser.parse_args()

    season = args.season
    if not season:
        state = get(f"{SLEEPER}/state/nfl") or {}
        season = state.get("season")
        if not season:
            raise SystemExit("could not determine current season; pass --season")

    ids = list(args.leagues)
    if args.from_league:
        ids += discover(args.from_league, season)
    ids = list(dict.fromkeys(ids))

    if not ids:
        parser.error("give league ids or --from-league")

    print(f"season {season} | measuring {len(ids)} leagues", file=sys.stderr)

    results = []
    for lid in ids:
        r = measure(lid, season)
        if r:
            results.append(r)
        time.sleep(0.3)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        render(results)


if __name__ == "__main__":
    main()
