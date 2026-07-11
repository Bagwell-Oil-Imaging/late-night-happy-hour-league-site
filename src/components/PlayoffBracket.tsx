import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MatchupDetail } from '../types'
import './PlayoffBracket.css'

type Seed = { seed: number; teamId: string; teamName: string; points: number }
type BracketMatch = {
  left: Seed | null; right: Seed | null; winner: Seed | null
  leftScore: number | null; rightScore: number | null
  leftMatchupId: string | null; rightMatchupId: string | null
  complete: boolean
}

interface PlayoffBracketProps {
  matchupDetails: MatchupDetail[]
  week: number
  playoffTeamCount?: number
  onSelectMatchup?: (matchupId: string) => void
}

export const FIRST_HALF = { start: 1, seedWeek: 13, playoffWeeks: [14, 15, 16], label: 'First Half' }
export const SECOND_HALF = { start: 17, seedWeek: 29, playoffWeeks: [30, 31, 32], label: 'Second Half' }
const SEED_POSITIONS = [1, 8, 4, 5, 2, 7, 3, 6]

// Playoff weeks keep the normal round-robin lane schedule — teams don't actually bowl their
// bracket opponent head-to-head. Advancement is decided by comparing each seeded team's own
// three-game total pins that week (whoever they were actually lane-paired against is irrelevant).
// The click-through detail modal shows that same real matchup — each team's actual opponent
// that night — not a fabricated head-to-head between the two bracket-seeded teams.
function findTeamWeekDetail(details: MatchupDetail[], week: number, teamId: string): MatchupDetail | null {
  return details.find(d => d.week === week && (d.team1.teamId === teamId || d.team2.teamId === teamId)) ?? null
}

function resolveMatch(details: MatchupDetail[], week: number, left: Seed | null, right: Seed | null, reached: boolean): BracketMatch {
  const leftDetail = reached && left ? findTeamWeekDetail(details, week, left.teamId) : null
  const rightDetail = reached && right ? findTeamWeekDetail(details, week, right.teamId) : null
  const leftScore = leftDetail && left ? (leftDetail.team1.teamId === left.teamId ? leftDetail.team1.totalSeries : leftDetail.team2.totalSeries) : null
  const rightScore = rightDetail && right ? (rightDetail.team1.teamId === right.teamId ? rightDetail.team1.totalSeries : rightDetail.team2.totalSeries) : null
  const leftMatchupId = leftDetail?.id ?? null
  const rightMatchupId = rightDetail?.id ?? null
  if (!left || !right) return { left, right, winner: left ?? right, leftScore, rightScore, leftMatchupId, rightMatchupId, complete: false }
  const complete = leftScore != null && rightScore != null
  const winner = complete && leftScore !== rightScore ? (leftScore! > rightScore! ? left : right) : null
  return { left, right, winner, leftScore, rightScore, leftMatchupId, rightMatchupId, complete }
}

function MatchCard({ match, title, cardRef, onSelectMatchup }: { match: BracketMatch; title?: string; cardRef?: (el: HTMLDivElement | null) => void; onSelectMatchup?: (matchupId: string) => void }) {
  const scoreFor = (team: Seed | null) => !team ? null : team.teamId === match.left?.teamId ? match.leftScore : match.rightScore
  const matchupIdFor = (team: Seed | null) => !team ? null : team.teamId === match.left?.teamId ? match.leftMatchupId : match.rightMatchupId
  return <div ref={cardRef} className={`playoff-match ${match.complete ? 'playoff-match--complete' : ''} ${match.winner ? 'playoff-match--decided' : ''}`}>
    {title && <div className="playoff-match__title">{title}</div>}
    {[match.left, match.right].map((team, index) => {
      const matchupId = matchupIdFor(team)
      const clickable = !!matchupId && !!onSelectMatchup
      return <div
        className={`playoff-team ${team && match.winner?.teamId === team.teamId ? 'playoff-team--winner' : ''} ${clickable ? 'playoff-team--clickable' : ''}`}
        key={team?.teamId ?? `open-${index}`}
        onClick={clickable ? () => onSelectMatchup!(matchupId!) : undefined}
        title={clickable ? `View ${team?.teamName}'s matchup this week` : team?.teamName}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectMatchup!(matchupId!) } } : undefined}
      >
        <span className="playoff-team__seed">{team ? team.seed : '—'}</span><span className="playoff-team__name">{team?.teamName ?? 'TBD'}</span><span className="playoff-team__score">{scoreFor(team) ?? ''}</span>
      </div>
    })}
    {match.left && !match.right && <div className="playoff-match__bye">Bye</div>}
    {match.complete && !match.winner && <div className="playoff-match__tie">Tied — roll-off pending</div>}
  </div>
}

// Measures the rendered quarterfinal/semifinal/final cards and produces:
//  - vertical offsets that center each semifinal/final card on the midpoint of its two feeder matches
//  - SVG elbow-connector paths joining feeder matches to the round they advance into
// Recomputed whenever the bracket data changes or the viewport resizes, since match card heights
// vary (ties/byes add a caption row) and can't be predicted from CSS alone.
function useBracketLayout(bracket: unknown, roundCount: number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const qfRefs = useRef<(HTMLDivElement | null)[]>([])
  const sfRefs = useRef<(HTMLDivElement | null)[]>([])
  const sfColumnRef = useRef<HTMLDivElement>(null)
  const finalRef = useRef<HTMLDivElement | null>(null)
  const finalColumnRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ sfTop: [0, 0], finalTop: 0, connectors: [] as string[] })

  useLayoutEffect(() => {
    if (roundCount < 3) return
    const container = containerRef.current
    if (!container) return

    function measure() {
      const cRect = container!.getBoundingClientRect()
      const rel = (rect: DOMRect) => ({ left: rect.left - cRect.left, right: rect.right - cRect.left, centerY: rect.top - cRect.top + rect.height / 2 })
      const qf = qfRefs.current.map(el => el ? rel(el.getBoundingClientRect()) : null)
      const sfCol = sfColumnRef.current ? rel(sfColumnRef.current.getBoundingClientRect()) : null
      const finalCol = finalColumnRef.current ? rel(finalColumnRef.current.getBoundingClientRect()) : null
      const sfHeights = sfRefs.current.map(el => el?.getBoundingClientRect().height ?? 0)
      const finalHeight = finalRef.current?.getBoundingClientRect().height ?? 0
      if (!sfCol || !finalCol) return

      const gutter1 = qf[0] ? sfCol.left - qf[0].right : 24
      const paths: string[] = []
      const sfTop: number[] = [0, 0]
      const sfCenters: number[] = []
      for (let i = 0; i < 2; i++) {
        const a = qf[i * 2], b = qf[i * 2 + 1]
        if (!a || !b) continue
        const midX = a.right + gutter1 / 2
        const centerY = (a.centerY + b.centerY) / 2
        sfTop[i] = centerY - sfHeights[i] / 2
        sfCenters[i] = centerY
        paths.push(`M ${a.right} ${a.centerY} H ${midX} V ${b.centerY} H ${b.right}`)
        paths.push(`M ${midX} ${centerY} H ${sfCol.left}`)
      }

      let finalTop = 0
      if (sfCenters.length === 2) {
        const gutter2 = finalCol.left - sfCol.right
        const midX2 = sfCol.right + gutter2 / 2
        const centerY2 = (sfCenters[0] + sfCenters[1]) / 2
        finalTop = centerY2 - finalHeight / 2
        paths.push(`M ${sfCol.right} ${sfCenters[0]} H ${midX2} V ${sfCenters[1]} H ${sfCol.right}`)
        paths.push(`M ${midX2} ${centerY2} H ${finalCol.left}`)
      }

      setLayout({ sfTop, finalTop, connectors: paths })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [bracket, roundCount])

  return { containerRef, qfRefs, sfRefs, sfColumnRef, finalRef, finalColumnRef, layout }
}

function PlayoffBracket({ matchupDetails, week, playoffTeamCount = 8, onSelectMatchup }: PlayoffBracketProps) {
  const bracket = useMemo(() => {
    const half = week <= 16 ? FIRST_HALF : SECOND_HALF
    const seedThrough = Math.min(Math.max(week, half.start), half.seedWeek)
    const totals = new Map<string, Seed>()
    matchupDetails.filter(detail => detail.week >= half.start && detail.week <= seedThrough).forEach(detail => [detail.team1, detail.team2].forEach(team => {
      const current = totals.get(team.teamId) ?? { seed: 0, teamId: team.teamId, teamName: team.teamName, points: 0 }
      current.points += team.points; totals.set(team.teamId, current)
    }))
    const count = Math.max(2, Math.min(8, Math.floor(playoffTeamCount)))
    const seeds = [...totals.values()].sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName)).slice(0, count).map((team, index) => ({ ...team, seed: index + 1 }))
    const bySeed = new Map(seeds.map(team => [team.seed, team])); const slots = SEED_POSITIONS.map(seed => bySeed.get(seed) ?? null)
    const quarterfinals = Array.from({ length: 4 }, (_, index) => {
      const left = slots[index * 2], right = slots[index * 2 + 1]
      return resolveMatch(matchupDetails, half.playoffWeeks[0], left, right, week >= half.playoffWeeks[0])
    })
    const semifinals = [[quarterfinals[0].winner, quarterfinals[1].winner], [quarterfinals[2].winner, quarterfinals[3].winner]].map(([left, right]) =>
      resolveMatch(matchupDetails, half.playoffWeeks[1], left, right, week >= half.playoffWeeks[1])
    )
    const left = semifinals[0].winner, right = semifinals[1].winner
    const final = resolveMatch(matchupDetails, half.playoffWeeks[2], left, right, week >= half.playoffWeeks[2])
    return { half, seedThrough, count, seeds, quarterfinals, semifinals, final }
  }, [matchupDetails, playoffTeamCount, week])

  const { containerRef, qfRefs, sfRefs, sfColumnRef, finalRef, finalColumnRef, layout } = useBracketLayout(bracket, 3)

  if (bracket.seeds.length === 0) return null
  const locked = week > bracket.half.seedWeek

  return <section className="playoff-bracket" aria-label={`${bracket.half.label} playoff bracket`}>
    {bracket.final.winner && <div className="playoff-bracket__champion">
      <span className="playoff-bracket__champion-label">{bracket.half.label} Champion</span>
      <span className="playoff-bracket__champion-name">{bracket.final.winner.teamName}</span>
    </div>}
    <div className="playoff-bracket__header"><div><p className="playoff-bracket__eyebrow">{bracket.half.label} playoffs</p><h3>Championship Bracket</h3></div><p className="playoff-bracket__status">{locked ? `Seeds locked after Week ${bracket.half.seedWeek}` : `Projected through Week ${bracket.seedThrough}`}</p></div>
    <p className="playoff-bracket__note">Top {bracket.count} teams qualify · three-game total pins · single elimination</p>
    <div className="playoff-bracket__scroll"><div className="playoff-bracket__rounds" ref={containerRef}>
      <svg className="playoff-bracket__connectors" aria-hidden="true">
        {layout.connectors.map((d, index) => <path key={index} d={d} />)}
      </svg>
      <div className="playoff-round">
        <h4>Week {bracket.half.playoffWeeks[0]}</h4>
        {bracket.quarterfinals.map((match, index) => <MatchCard key={index} match={match} cardRef={el => { qfRefs.current[index] = el }} onSelectMatchup={onSelectMatchup} />)}
      </div>
      <div className="playoff-round playoff-round--semis" ref={sfColumnRef}>
        <h4>Week {bracket.half.playoffWeeks[1]}</h4>
        {bracket.semifinals.map((match, index) => <div key={index} className="playoff-round__slot" style={{ top: layout.sfTop[index] }}>
          <MatchCard match={match} cardRef={el => { sfRefs.current[index] = el }} onSelectMatchup={onSelectMatchup} />
        </div>)}
      </div>
      <div className="playoff-round playoff-round--final" ref={finalColumnRef}>
        <h4>Week {bracket.half.playoffWeeks[2]}</h4>
        <div className="playoff-round__slot" style={{ top: layout.finalTop }}>
          <MatchCard match={bracket.final} title="Half Championship" cardRef={el => { finalRef.current = el }} onSelectMatchup={onSelectMatchup} />
        </div>
      </div>
    </div></div>
  </section>
}
export default PlayoffBracket
