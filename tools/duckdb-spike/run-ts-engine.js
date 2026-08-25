// Runs the app's real TypeScript valuation engine (compiled to CommonJS)
// against fixed inputs, so its output can be diffed against the SQL port.
//
// This imports the actual shipped code — projections.model and vor.model —
// rather than reimplementing it. A comparison between two things I wrote from
// the same idea proves nothing; a comparison against the code that runs in
// production proves the SQL is a faithful port.
const fs = require('fs')
const path = require('path')

const SP = __dirname
const proj = require(path.join(SP, 'tsrun', 'projections.model.js'))
const vor = require(path.join(SP, 'tsrun', 'vor.model.js'))

const raw = JSON.parse(fs.readFileSync(path.join(SP, 'proj2026.json'), 'utf8'))
const league = JSON.parse(fs.readFileSync(path.join(SP, 'clt2026.json'), 'utf8'))

const scoring = league.scoring_settings
const rosterPositions = league.roster_positions
const numTeams = league.total_rosters
const ppr = scoring.rec ?? 0

const players = raw.map(proj.parseProjection)

const scored = []
for (const p of players) {
  const position = (p.position ?? '').toUpperCase()
  if (!proj.VALUED_POSITIONS.includes(position)) continue
  const result = proj.projectedPoints(p, scoring, ppr)
  scored.push({ player: p, position, points: result.points })
}

const starters = vor.startersByPosition(rosterPositions, numTeams, scored)
const levels = vor.replacementLevels(scored, starters)
const values = vor.valuesFromVor(scored, levels)

const out = scored
  .map((s) => ({
    playerId: s.player.playerId,
    position: s.position,
    points: Number(s.points.toFixed(4)),
    value: values.get(s.player.playerId) ?? 0,
  }))
  .sort((a, b) => (a.playerId < b.playerId ? -1 : 1))

fs.writeFileSync(path.join(SP, 'ts-values.json'), JSON.stringify(out))
fs.writeFileSync(
  path.join(SP, 'ts-meta.json'),
  JSON.stringify({ starters, levels, ppr, numTeams }, null, 2),
)

console.log('scored players :', out.length)
console.log('starters       :', JSON.stringify(starters))
console.log('replacement    :', JSON.stringify(levels))
