/**
 * @file DataCorrectionAdmin.tsx
 *
 * Two-mode admin panel for manual data correction:
 *
 *  Edit Teams — expandable list of every team; manage roster and entering averages.
 *  Edit Scores — pick a week, see every matchup for that week; missing-matchup teams
 *                highlighted. Expand any row to edit both sides inline with a
 *                two-panel layout. "Switch Side" flips which panel is editable
 *                WITHOUT re-fetching data.
 */

import { useState, useEffect, useMemo, Fragment } from 'react'
import {
  collection, query, where, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, doc, setDoc,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { useTeams, useScheduleWeeks, useLeagueConfig } from '../../hooks'
import { useSeasonYear } from '../../context/SeasonContext'
import { calculateGameHandicap } from '../../utils/handicap'
import { isLocalAdminBypass, localAdminWrite } from '../../utils/localAdmin'
import type { Bowler, BowlerScore, MatchupDetail, Team, TeamSummary } from '../../types'
import './AnnouncementsAdmin.css'
import './DataCorrectionAdmin.css'

// ── Constants ─────────────────────────────────────────────────────────────────

// Blind score penalty: 10% of the bowler's average, rounded down, deducted from their average.
// Matches the formula used in the transform pipeline.
const BLIND_PENALTY_PCT = 0.10
const LOCAL_ADMIN_BYPASS = import.meta.env.DEV
  && import.meta.env.VITE_LOCAL_ADMIN_BYPASS === 'true'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname)

// 36 lanes in the house → 18 pairs: odd lane is always the first of the pair (1, 3, 5 … 35)
const LANE_PAIRS = Array.from({ length: 18 }, (_, i) => ({
  value: i * 2 + 1,
  label: `Lanes ${i * 2 + 1}–${i * 2 + 2}`,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeTeamName(name?: string): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Returns true when a team name (case-insensitive) indicates a Vacant slot. */
function isVacantTeam(name?: string): boolean {
  return (name ?? '').toLowerCase().includes('vacant')
}

/** Returns 1 for a win, 0 for a loss, 0.5 for a tie. */
function gPoint(a: number, b: number): number {
  return a > b ? 1 : a < b ? 0 : 0.5
}

/**
 * Average used as the basis for blind-score penalty calc: the bowler's current
 * rolling season average, falling back to their prior-season entering average
 * only when they have no current-season games yet (average === 0).
 */
function blindBaseAvg(b: Bowler): number {
  return (b.average ?? 0) > 0 ? b.average : (b.enteringAvg ?? 0)
}

/**
 * Selects exactly 4 bowlerScore docs from an oversized set for one team/week.
 *
 * Priority order for inclusion:
 *  1. All real (non-blind) scores are always kept.
 *  2. Blind scores fill remaining slots, sorted by most rollingGames first,
 *     then highest rollingAvg as a tiebreaker.
 *
 * @param allDocs - All bowlerScore docs for the team/week (may be > 4)
 * @returns keep: the 4 docs to retain; remove: the excess docs to delete
 */
function selectFourDocs(
  allDocs: Array<BowlerScore & { id: string }>
): { keep: Array<BowlerScore & { id: string }>; remove: Array<BowlerScore & { id: string }> } {
  const real = allDocs.filter(d => !d.blinded)
  const blinds = allDocs
    .filter(d => d.blinded)
    .sort((a, b) => {
      const gDiff = (b.rollingGames ?? 0) - (a.rollingGames ?? 0)
      if (gDiff !== 0) return gDiff
      return (b.rollingAvg ?? 0) - (a.rollingAvg ?? 0)
    })
  const blindsNeeded = Math.max(0, 4 - real.length)
  return {
    keep: [...real, ...blinds.slice(0, blindsNeeded)],
    remove: blinds.slice(blindsNeeded),
  }
}

/**
 * Reconstructs synthetic Bowler rows for substitutes from saved bowlerScore docs.
 * A sub isn't on the team's roster, so their bowlerScore doc (bowlerName + substituteAvg)
 * is the only record of who they are and what average drove their handicap that week.
 */
function extractSubRows(
  scoreDocs: Array<BowlerScore>, rosterIds: Set<string>, teamId: string, teamName: string, seasonYear: string
): Bowler[] {
  const rows: Bowler[] = []
  const seen = new Set<string>()
  for (const bs of scoreDocs) {
    if (!bs.isSubstitute || rosterIds.has(bs.bowlerId) || seen.has(bs.bowlerId)) continue
    seen.add(bs.bowlerId)
    const avg = bs.substituteAvg ?? 0
    rows.push({
      id: bs.bowlerId, leaguePalsId: '', seasonYear, teamId, teamName,
      firstName: '', lastName: '', name: bs.bowlerName, avatarUrl: null,
      average: avg, averageFloat: avg, enteringAvg: avg, enteringAvgSeason: seasonYear,
      highGame: 0, highGameHdcp: 0, highSeries: 0, highSeriesHdcp: 0, gamesPlayed: 0,
      blindWeeksTotal: 0, blindWeeksRow: 0, indPointsWon: 0, isSubPool: true,
    })
  }
  return rows
}

// ── Local types ───────────────────────────────────────────────────────────────

interface RosterRow {
  id: string
  firstName: string
  lastName: string
  enteringAvg: string
  saving: boolean
}

interface ScoreInput {
  /** Explicit average used for this matchup. Blank falls back to the calculated entering average. */
  avg: string
  g1: string
  g2: string
  g3: string
  blind1: boolean
  blind2: boolean
  blind3: boolean
}

type ScoreInputs = Record<string, ScoreInput>

/** Returns the editable point-in-time average used for this bowler in this matchup. */
function weeklyAvg(bowler: Bowler, input?: ScoreInput): number {
  const raw = input?.avg?.trim() ?? ''
  return raw !== '' ? (parseInt(raw, 10) || 0) : blindBaseAvg(bowler)
}

/** Blank means automatic handicap; otherwise returns the pinned whole-number value. */
function pinnedHandicap(raw?: string): number | null {
  const value = raw?.trim() ?? ''
  return value === '' ? null : (parseInt(value, 10) || 0)
}

interface TeamTotalsInputs {
  g1: string; g2: string; g3: string; points: string
}

/**
 * One row in the weekly matchup list.
 * type='matchup' — has a matchupDetails record.
 * type='orphan'  — has bowlerScores for the week but no matchupDetails.
 * type='missing' — no bowlerScores and no matchupDetails; team has no data this week.
 */
interface WeekEntry {
  id: string
  type: 'matchup' | 'orphan' | 'missing'
  matchupDetail: MatchupDetail | null
  matchupDetailDocId: string | null
  orphanTeam: Team | null
  orphanBowlerScores: BowlerScore[]
}

/**
 * Validation result for one matchupDetail record.
 * valid is true only when both teams have exactly 4 bowlerScore docs for the week.
 */
interface MatchupValidationResult {
  week: number
  matchupDetailId: string
  team1Name: string
  team1Id: string
  team2Name: string
  team2Id: string
  team1Count: number
  team2Count: number
  /** True when the team side used team-totals-only mode — no bowlerScore docs expected. */
  team1Manual: boolean
  team2Manual: boolean
  /** True when stored game1/2/3Total don't match the sum of actual bowlerScore docs. */
  team1Mismatch: boolean
  team2Mismatch: boolean
  valid: boolean
}
interface ReingestOverrideItem {
  collection: string
  docId: string
  label: string
  value: unknown
}

interface ReingestResponse {
  dryRun: boolean
  generated: {
    weekDate: string
    matchups: number
    matchupDetails: number
    bowlerScores: number
  }
  overrideSummary: {
    count: number
    matchupDetails: ReingestOverrideItem[]
    bowlerScores: ReingestOverrideItem[]
  }
  writeSummary?: {
    deletedMatchupDetails: number
    deletedBowlerScores: number
    writtenMatchups: number
    writtenMatchupDetails: number
    writtenBowlerScores: number
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

function DataCorrectionAdmin() {
  const seasonYear = useSeasonYear()
  const { data: teams } = useTeams(seasonYear)
  const { data: scheduleWeeks } = useScheduleWeeks(seasonYear)
  const { data: leagueConfig } = useLeagueConfig(seasonYear)

  // ── Top-level mode ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'teams' | 'scores' | 'validate'>('teams')

  // ── Edit Teams state ───────────────────────────────────────────────────────
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
  /** Bowler arrays keyed by teamId — loaded once on first expand, then cached. */
  const [bowlersCache, setBowlersCache] = useState<Record<string, Bowler[]>>({})
  /** Editable roster rows keyed by teamId. */
  const [rosterCache, setRosterCache] = useState<Record<string, RosterRow[]>>({})
  const [loadingBowlersFor, setLoadingBowlersFor] = useState<string | null>(null)
  const [addBowlerTeamId, setAddBowlerTeamId] = useState<string | null>(null)
  const [addBowlerForm, setAddBowlerForm] = useState({ firstName: '', lastName: '', enteringAvg: '' })
  const [savingNewBowler, setSavingNewBowler] = useState(false)
  const [creatingTeam, setCreatingTeam] = useState<{ displayId: string; name: string; captainName: string } | null>(null)
  const [savingTeam, setSavingTeam] = useState(false)
  const [teamMsg, setTeamMsg] = useState('')
  const [teamError, setTeamError] = useState('')
  const [rosterMsg, setRosterMsg] = useState('')
  const [rosterError, setRosterError] = useState('')

  // ── Edit Scores state ──────────────────────────────────────────────────────
  const [selectedWeek, setSelectedWeek] = useState<number | ''>('')
  const [weekEntries, setWeekEntries] = useState<WeekEntry[]>([])
  const [loadingWeek, setLoadingWeek] = useState(false)
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [loadingExpanded, setLoadingExpanded] = useState(false)

  /**
   * Which panel has the active edit controls.
   * 'left' = team1 / orphan team.  'right' = team2 / selected opponent.
   * Toggling this never triggers a Firestore fetch — data is pre-loaded at expand time.
   */
  const [editingSide, setEditingSide] = useState<'left' | 'right'>('left')

  // Entry mode shared across both sides (only one side edits at a time)
  const [scoreEntryMode, setScoreEntryMode] = useState<'individual' | 'teamTotals'>('individual')
  const [teamTotalsInputs, setTeamTotalsInputs] = useState<TeamTotalsInputs>(
    { g1: '', g2: '', g3: '', points: '' }
  )

  // Both sides' data — loaded together when a matchup is expanded
  const [leftBowlers, setLeftBowlers] = useState<Bowler[]>([])
  const [rightBowlers, setRightBowlers] = useState<Bowler[]>([])
  const [leftScoreInputs, setLeftScoreInputs] = useState<ScoreInputs>({})
  const [rightScoreInputs, setRightScoreInputs] = useState<ScoreInputs>({})
  /** Per-team manual per-game handicap. Blank means use the configured automatic formula. */
  const [handicapOverrideInputs, setHandicapOverrideInputs] = useState<Record<string, string>>({})
  const [leftExistingDocs, setLeftExistingDocs] = useState<Record<string, string>>({})
  const [rightExistingDocs, setRightExistingDocs] = useState<Record<string, string>>({})
  /** Bowler IDs explicitly marked as "not bowling this week" — excluded from liveTotals and save. */
  const [leftExcluded, setLeftExcluded] = useState<Set<string>>(new Set())
  const [rightExcluded, setRightExcluded] = useState<Set<string>>(new Set())
  /** IDs (within leftBowlers/rightBowlers) that are substitutes added for this matchup, not roster members. */
  const [leftSubRowIds, setLeftSubRowIds] = useState<Set<string>>(new Set())
  const [rightSubRowIds, setRightSubRowIds] = useState<Set<string>>(new Set())

  // ── Add Sub state ──────────────────────────────────────────────────────────
  /** League-wide substitute pool (isSubPool bowlers), loaded lazily on first "+ Add Sub" click. */
  const [subPool, setSubPool] = useState<Bowler[]>([])
  const [loadingSubPool, setLoadingSubPool] = useState(false)
  const [showAddSubForm, setShowAddSubForm] = useState(false)
  const [addSubForm, setAddSubForm] = useState({
    subId: '', firstName: '', lastName: '', enteringAvg: '', weeklyAvg: '',
  })
  const [savingSub, setSavingSub] = useState(false)

  // Lane pair for the current matchup — shared by both teams, edited once
  const [laneInput, setLaneInput] = useState('')

  // Opponent selector for orphan entries
  const [orphanOpponentId, setOrphanOpponentId] = useState('')
  const [loadingOrphanOpp, setLoadingOrphanOpp] = useState(false)

  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savingScores, setSavingScores] = useState(false)
  const [savingTeamTotals, setSavingTeamTotals] = useState(false)
  const [deletingData, setDeletingData] = useState(false)
  const [swappingLanes, setSwappingLanes] = useState(false)
  const [reingestingWeek, setReingestingWeek] = useState(false)
  const [reingestStatus, setReingestStatus] = useState('')
  const [reingestReport, setReingestReport] = useState<ReingestResponse | null>(null)
  /** When true, shows a read-only summary of both panels after a successful save. */
  const [showSummary, setShowSummary] = useState(false)

  // ── Validate Matchups state ────────────────────────────────────────────────
  const [validationResults, setValidationResults] = useState<MatchupValidationResult[]>([])
  const [runningValidation, setRunningValidation] = useState(false)
  const [validationComplete, setValidationComplete] = useState(false)
  const [showValidAll, setShowValidAll] = useState(false)
  const [autoFixRunning, setAutoFixRunning] = useState(false)
  const [autoFixMsg, setAutoFixMsg] = useState('')

  // ── Derived ────────────────────────────────────────────────────────────────

  const completedWeeks = useMemo(
    () => scheduleWeeks.filter(w => w.status === 'completed' && w.week != null),
    [scheduleWeeks]
  )

  const teamsSortedById = useMemo(
    () => [...teams].sort((a, b) => a.displayId - b.displayId),
    [teams]
  )

  const expandedEntry = weekEntries.find(e => e.id === expandedEntryId) ?? null
  const expandedDetail = expandedEntry?.matchupDetail ?? null

  const leftTeamName = expandedDetail?.team1?.teamName ?? expandedEntry?.orphanTeam?.name ?? '—'
  const rightTeamName = expandedDetail?.team2?.teamName
    ?? (orphanOpponentId ? (teams.find(t => t.id === orphanOpponentId)?.name ?? 'Opponent') : '—')
  const leftTeamId = expandedDetail?.team1?.teamId ?? expandedEntry?.orphanTeam?.id ?? ''
  const rightTeamId = expandedDetail?.team2?.teamId ?? orphanOpponentId

  // Active side shortcuts — used in save handlers
  const activeBowlers = editingSide === 'left' ? leftBowlers : rightBowlers
  const activeScoreInputs = editingSide === 'left' ? leftScoreInputs : rightScoreInputs
  const activeExistingDocs = editingSide === 'left' ? leftExistingDocs : rightExistingDocs
  const activeExcluded = editingSide === 'left' ? leftExcluded : rightExcluded
  const activeSubRowIds = editingSide === 'left' ? leftSubRowIds : rightSubRowIds
  const setActiveSubRowIds = editingSide === 'left' ? setLeftSubRowIds : setRightSubRowIds
  const activeTeamId = editingSide === 'left' ? leftTeamId : rightTeamId
  const activeTeam = teams.find(t => t.id === activeTeamId)
  const activeHandicapOverrideInput = handicapOverrideInputs[activeTeamId] ?? ''
  const activeHandicapOverride = pinnedHandicap(activeHandicapOverrideInput)
  const activeSideKey: 'team1' | 'team2' = editingSide === 'left' ? 'team1' : 'team2'
  const oppSideKey: 'team1' | 'team2' = editingSide === 'left' ? 'team2' : 'team1'

  const isLeftVacant = isVacantTeam(leftTeamName)
  const isRightVacant = isVacantTeam(rightTeamName)
  /** True when the non-editing panel is a Vacant team. Drives score auto-calculation. */
  const isOpponentVacant = editingSide === 'left' ? isRightVacant : isLeftVacant

  /** Week entries sorted by lane pair (asc), orphans after matchups, missing last. Re-sorts on every save. */
  const sortedWeekEntries = useMemo(() => {
    const typeOrder = { matchup: 0, orphan: 1, missing: 2 }
    return [...weekEntries].sort((a, b) => {
      const tA = typeOrder[a.type], tB = typeOrder[b.type]
      if (tA !== tB) return tA - tB
      // Within matchups: assigned lanes first (ascending), unassigned last
      const lA = a.matchupDetail?.team1?.lane || 999
      const lB = b.matchupDetail?.team1?.lane || 999
      return lA - lB
    })
  }, [weekEntries])

  /** Lane pair values already claimed by other matchups this week — excludes the currently-expanded matchup. */
  const usedLanes = useMemo(() => new Set(
    weekEntries
      .filter(e => e.id !== expandedEntryId && e.type === 'matchup' && e.matchupDetail)
      .map(e => e.matchupDetail!.team1?.lane ?? 0)
      .filter(l => l > 0)
  ), [weekEntries, expandedEntryId])

  /** Teams not in any matchupDetails this week — used as opponent candidates for orphan and missing entries. */
  const teamsWithoutMatchup = useMemo(() => {
    if (!expandedEntry || expandedEntry.type === 'matchup') return []
    const coveredIds = new Set<string>()
    const coveredNorms = new Set<string>()
    for (const e of weekEntries) {
      if (e.type !== 'matchup' || !e.matchupDetail) continue
      const { team1, team2 } = e.matchupDetail
      if (team1?.teamId) coveredIds.add(team1.teamId)
      if (team2?.teamId) coveredIds.add(team2.teamId)
      coveredNorms.add(normalizeTeamName(team1?.teamName))
      coveredNorms.add(normalizeTeamName(team2?.teamName))
    }
    return teams.filter(t => {
      if (t.id === expandedEntry.orphanTeam?.id) return false
      return !coveredIds.has(t.id!) && !coveredNorms.has(normalizeTeamName(t.name))
    })
  }, [expandedEntry, weekEntries, teams])

  // ── Edit Teams: handlers ───────────────────────────────────────────────────

  /**
   * Toggles expansion of a team row, loading bowlers from Firestore on first open.
   * Subsequent opens use the in-memory cache.
   */
  async function handleToggleTeam(teamId: string) {
    if (expandedTeamId === teamId) { setExpandedTeamId(null); return }
    setExpandedTeamId(teamId)
    setRosterMsg('')
    setRosterError('')
    if (bowlersCache[teamId]) return

    setLoadingBowlersFor(teamId)
    try {
      const snap = await getDocs(
        query(collection(db, 'bowlers'), where('teamId', '==', teamId), where('seasonYear', '==', seasonYear))
      )
      const bowlers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bowler))
      setBowlersCache(prev => ({ ...prev, [teamId]: bowlers }))
      setRosterCache(prev => ({
        ...prev,
        [teamId]: bowlers.map(b => ({
          id: b.id!, firstName: b.firstName, lastName: b.lastName,
          enteringAvg: String(b.enteringAvg ?? 0), saving: false,
        })),
      }))
    } catch {
      setRosterError('Failed to load bowlers.')
    } finally {
      setLoadingBowlersFor(null)
    }
  }

  function updateRosterRow(teamId: string, rowId: string, field: 'firstName' | 'lastName' | 'enteringAvg', value: string) {
    setRosterCache(prev => ({
      ...prev,
      [teamId]: (prev[teamId] ?? []).map(r => r.id === rowId ? { ...r, [field]: value } : r),
    }))
  }

  /**
   * Persists edits to a bowler document. Sets `adminOverride: true` so the
   * pipeline preserves the record across automated data refreshes.
   */
  async function handleSaveBowler(teamId: string, row: RosterRow) {
    setRosterMsg('')
    setRosterError('')
    setRosterCache(prev => ({
      ...prev,
      [teamId]: (prev[teamId] ?? []).map(r => r.id === row.id ? { ...r, saving: true } : r),
    }))
    const firstName = row.firstName.trim()
    const lastName = row.lastName.trim()
    const enteringAvg = parseInt(row.enteringAvg) || 0
    const name = `${firstName} ${lastName}`.trim()
    const updates = {
      firstName, lastName, name, enteringAvg, averageFloat: enteringAvg,
      adminOverride: true, rosterRemoved: false,
    }
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'save-roster-bowler', docId: row.id, ...updates })
      } else {
        await updateDoc(doc(db, 'bowlers', row.id), updates)
      }
      setRosterMsg(`${name} saved.`)
    } catch (error) {
      console.error('[DataCorrectionAdmin] Failed to save roster bowler:', error)
      setRosterError(`Failed to save ${name}.`)
    } finally {
      setRosterCache(prev => ({
        ...prev,
        [teamId]: (prev[teamId] ?? []).map(r => r.id === row.id ? { ...r, saving: false } : r),
      }))
    }
  }

  async function handleDeleteBowler(teamId: string, id: string, name: string) {
    if (!window.confirm(`Remove ${name} from the roster?`)) return
    setRosterMsg('')
    setRosterError('')
    const removal = {
      teamId: '', teamName: '', adminOverride: true, rosterRemoved: true,
      rosterRemovedAt: new Date().toISOString(),
    }
    try {
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'remove-roster-bowler', docId: id })
      } else {
        await updateDoc(doc(db, 'bowlers', id), removal)
      }
      setBowlersCache(prev => ({ ...prev, [teamId]: (prev[teamId] ?? []).filter(b => b.id !== id) }))
      setRosterCache(prev => ({ ...prev, [teamId]: (prev[teamId] ?? []).filter(r => r.id !== id) }))
      setRosterMsg(`${name} removed.`)
    } catch (error) {
      console.error('[DataCorrectionAdmin] Failed to remove roster bowler:', error)
      setRosterError(`Failed to remove ${name}.`)
    }
  }

  async function handleAddBowler(teamId: string) {
    const team = teams.find(t => t.id === teamId)
    if (!team) return
    const firstName = addBowlerForm.firstName.trim()
    const lastName = addBowlerForm.lastName.trim()
    const enteringAvg = parseInt(addBowlerForm.enteringAvg) || 0
    if (!firstName || !lastName) { setRosterError('First and last name are required.'); return }
    const name = `${firstName} ${lastName}`
    setSavingNewBowler(true)
    setRosterError('')
    try {
      const data = {
        leaguePalsId: `admin-${Date.now()}`, seasonYear, teamId, teamName: team.name,
        firstName, lastName, name, avatarUrl: null,
        average: enteringAvg, averageFloat: enteringAvg, enteringAvg,
        enteringAvgSeason: seasonYear, highGame: 0, highGameHdcp: 0,
        highSeries: 0, highSeriesHdcp: 0, gamesPlayed: 0,
        blindWeeksTotal: 0, blindWeeksRow: 0, indPointsWon: 0, adminOverride: true,
      }
      const ref = doc(collection(db, 'bowlers'))
      if (isLocalAdminBypass()) {
        await localAdminWrite({ operation: 'add-roster-bowler', docId: ref.id, bowler: data })
      } else {
        await setDoc(ref, data)
      }
      const added = { ...data, id: ref.id } as Bowler
      setBowlersCache(prev => ({ ...prev, [teamId]: [...(prev[teamId] ?? []), added] }))
      setRosterCache(prev => ({
        ...prev,
        [teamId]: [
          ...(prev[teamId] ?? []),
          { id: ref.id, firstName, lastName, enteringAvg: String(enteringAvg), saving: false },
        ],
      }))
      setAddBowlerTeamId(null)
      setAddBowlerForm({ firstName: '', lastName: '', enteringAvg: '' })
      setRosterMsg(`${name} added.`)
    } catch (error) {
      console.error('[DataCorrectionAdmin] Failed to add roster bowler:', error)
      setRosterError('Failed to add bowler.')
    } finally {
      setSavingNewBowler(false)
    }
  }

  /**
   * Creates a new team with a deterministic synthetic ID `admin-team-{displayId}`.
   * Safe to run twice — setDoc is idempotent on that key.
   */
  async function handleCreateTeam() {
    if (!creatingTeam) return
    const displayId = parseInt(creatingTeam.displayId)
    const name = creatingTeam.name.trim()
    if (!displayId || !name) { setTeamError('Team number and name are required.'); return }
    setSavingTeam(true)
    setTeamError('')
    const docId = `admin-team-${displayId}`
    try {
      await setDoc(doc(db, 'teams', docId), {
        leaguePalsId: docId, displayId, seasonYear, name,
        captainName: creatingTeam.captainName.trim(), captainBowlerId: null,
        wins: 0, losses: 0, ties: 0, points: 0, pointsWon: 0, pointsLost: 0,
        pctWon: 0, average: 0, scratchPins: 0, totalPins: 0, highGame: 0, adminOverride: true,
      })
      setCreatingTeam(null)
      setTeamMsg(`Team "${name}" (ID ${displayId}) created. Select it above to manage its roster.`)
    } catch {
      setTeamError('Failed to create team.')
    } finally {
      setSavingTeam(false)
    }
  }

  // ── Edit Scores: load week matchups ────────────────────────────────────────

  useEffect(() => {
    if (!selectedWeek) { setWeekEntries([]); setExpandedEntryId(null); return }
    loadWeekMatchups(selectedWeek as number)
  }, [selectedWeek, seasonYear]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Fetches all matchupDetails for the week, then checks remaining teams for
   * orphaned bowlerScores (data present but no matchup record).
   */
  async function loadWeekMatchups(week: number) {
    setLoadingWeek(true)
    setWeekEntries([])
    setExpandedEntryId(null)
    setSaveMsg('')
    setSaveError('')
    setReingestStatus('')
    setReingestReport(null)
    try {
      const detailsSnap = await getDocs(
        query(collection(db, 'matchupDetails'), where('seasonYear', '==', seasonYear), where('week', '==', week))
      )
      const details = detailsSnap.docs.map(d => ({ id: d.id, ...d.data() } as MatchupDetail))

      const coveredIds = new Set<string>()
      const coveredNorms = new Set<string>()
      for (const d of details) {
        if (d.team1?.teamId) coveredIds.add(d.team1.teamId)
        if (d.team2?.teamId) coveredIds.add(d.team2.teamId)
        coveredNorms.add(normalizeTeamName(d.team1?.teamName))
        coveredNorms.add(normalizeTeamName(d.team2?.teamName))
      }

      const orphanCandidates = teams.filter(t => {
        if ((t.name ?? '').toLowerCase().includes('vacant')) return false
        return !coveredIds.has(t.id!) && !coveredNorms.has(normalizeTeamName(t.name))
      })

      const orphanEntries: WeekEntry[] = []
      const missingEntries: WeekEntry[] = []
      for (const team of orphanCandidates) {
        const snap = await getDocs(
          query(
            collection(db, 'bowlerScores'),
            where('teamId', '==', team.id),
            where('seasonYear', '==', seasonYear),
            where('week', '==', week)
          )
        )
        if (!snap.empty) {
          orphanEntries.push({
            id: `orphan-${team.id}`, type: 'orphan',
            matchupDetail: null, matchupDetailDocId: null,
            orphanTeam: team,
            orphanBowlerScores: snap.docs.map(d => ({ id: d.id, ...d.data() } as BowlerScore)),
          })
        } else {
          missingEntries.push({
            id: `missing-${team.id}`, type: 'missing',
            matchupDetail: null, matchupDetailDocId: null,
            orphanTeam: team,
            orphanBowlerScores: [],
          })
        }
      }

      const matchupEntries: WeekEntry[] = details
        .sort((a, b) => (a.team1?.lane ?? 0) - (b.team1?.lane ?? 0))
        .map(d => ({
          id: d.id!, type: 'matchup' as const,
          matchupDetail: d, matchupDetailDocId: d.id!,
          orphanTeam: null, orphanBowlerScores: [],
        }))

      setWeekEntries([...matchupEntries, ...orphanEntries, ...missingEntries])
    } catch (err) {
      console.error('[DataCorrectionAdmin] loadWeekMatchups:', err)
    } finally {
      setLoadingWeek(false)
    }
  }

  // ── Edit Scores: expand a matchup inline ───────────────────────────────────

  /**
   * Looks up each bowler's true current average — the `rollingAvg` stored on
   * their most recent bowlerScores doc from before `beforeWeek`. `bowlers.average`
   * is only refreshed by a full pipeline run (`npm run transform`); a single-week
   * `reingest-week` correction updates bowlerScores but never that field, so it can
   * go stale. Returns an empty map for week 1 (nothing precedes it).
   */
  async function loadCurrentAvgs(teamId: string, beforeWeek: number): Promise<Record<string, number>> {
    if (beforeWeek <= 1) return {}
    const snap = await getDocs(
      query(
        collection(db, 'bowlerScores'),
        where('teamId', '==', teamId),
        where('seasonYear', '==', seasonYear),
        where('week', '<', beforeWeek)
      )
    )
    const latest = new Map<string, { week: number; rollingAvg: number }>()
    for (const d of snap.docs) {
      const bs = d.data() as BowlerScore
      if (bs.rollingAvg == null) continue
      const cur = latest.get(bs.bowlerId)
      if (!cur || bs.week > cur.week) latest.set(bs.bowlerId, { week: bs.week, rollingAvg: bs.rollingAvg })
    }
    const result: Record<string, number> = {}
    for (const [bowlerId, v] of latest) result[bowlerId] = v.rollingAvg
    return result
  }

  /** Overrides each bowler's `average` with their true current avg where known. */
  function applyCurrentAvgs(bowlers: Bowler[], avgMap: Record<string, number>): Bowler[] {
    return bowlers.map(b => (b.id && avgMap[b.id] != null) ? { ...b, average: avgMap[b.id] } : b)
  }

  function resetEditorState() {
    setEditingSide('left')
    setScoreEntryMode('individual')
    setTeamTotalsInputs({ g1: '', g2: '', g3: '', points: '' })
    setLaneInput('')
    setOrphanOpponentId('')
    setLeftBowlers([])
    setRightBowlers([])
    setLeftScoreInputs({})
    setRightScoreInputs({})
    setHandicapOverrideInputs({})
    setLeftExistingDocs({})
    setRightExistingDocs({})
    setLeftExcluded(new Set())
    setRightExcluded(new Set())
    setLeftSubRowIds(new Set())
    setRightSubRowIds(new Set())
    setShowAddSubForm(false)
    setAddSubForm({ subId: '', firstName: '', lastName: '', enteringAvg: '', weeklyAvg: '' })
    setSaveMsg('')
    setSaveError('')
    setShowSummary(false)
  }

  /**
   * Expands a matchup row and pre-loads BOTH teams' bowlers and bowlerScores so
   * "Switch Side" can flip the editable panel without any further Firestore reads.
   */
  async function handleExpandEntry(entryId: string) {
    if (expandedEntryId === entryId) { setExpandedEntryId(null); return }
    resetEditorState()
    setExpandedEntryId(entryId)

    const entry = weekEntries.find(e => e.id === entryId)
    if (!entry) return

    // Pre-fill lane from existing matchup data (team1.lane and team2.lane are the same pair)
    const existingLane = entry.matchupDetail?.team1?.lane
    if (existingLane) setLaneInput(String(existingLane))

    setLoadingExpanded(true)
    try {
      if (!entry.matchupDetail) {
        // Orphan: load left team's bowlers; right side waits for opponent selection
        const [bowlerSnap, leftAvgMap] = await Promise.all([
          getDocs(query(collection(db, 'bowlers'), where('teamId', '==', entry.orphanTeam!.id), where('seasonYear', '==', seasonYear))),
          loadCurrentAvgs(entry.orphanTeam!.id!, selectedWeek as number),
        ])
        const leftRosterIds = new Set(bowlerSnap.docs.map(d => d.id))
        const leftSubRows = extractSubRows(
          entry.orphanBowlerScores, leftRosterIds, entry.orphanTeam!.id!, entry.orphanTeam!.name, seasonYear
        )
        setLeftBowlers([
          ...applyCurrentAvgs(bowlerSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)), leftAvgMap),
          ...leftSubRows,
        ])
        setLeftSubRowIds(new Set(leftSubRows.map(b => b.id!)))
        // Pre-fill left inputs from orphanBowlerScores
        const inputs: ScoreInputs = {}
        const eDocs: Record<string, string> = {}
        for (const bs of entry.orphanBowlerScores) {
          const b1 = bs.blind1 ?? bs.blinded ?? false
          const b2 = bs.blind2 ?? bs.blinded ?? false
          const b3 = bs.blind3 ?? bs.blinded ?? false
          inputs[bs.bowlerId] = {
            avg: bs.avgBeforeThisWeek != null ? String(bs.avgBeforeThisWeek) : '',
            g1: b1 ? '' : (bs.game1 != null ? String(bs.game1) : ''),
            g2: b2 ? '' : (bs.game2 != null ? String(bs.game2) : ''),
            g3: b3 ? '' : (bs.game3 != null ? String(bs.game3) : ''),
            blind1: b1, blind2: b2, blind3: b3,
          }
          eDocs[bs.bowlerId] = bs.id!
        }
        setLeftScoreInputs(inputs)
        setLeftExistingDocs(eDocs)
        // Roster bowlers without a score doc start excluded.
        const leftWithDocs = new Set(Object.keys(inputs))
        setLeftExcluded(new Set(bowlerSnap.docs.map(d => d.id).filter(id => !leftWithDocs.has(id))))
        return
      }

      // Regular matchup: load both sides in parallel
      const d = entry.matchupDetail
      const t1Id = d.team1?.teamId ?? ''
      const t2Id = d.team2?.teamId ?? ''
      setHandicapOverrideInputs({
        [t1Id]: d.team1?.handicapOverride != null ? String(d.team1.handicapOverride) : '',
        [t2Id]: d.team2?.handicapOverride != null ? String(d.team2.handicapOverride) : '',
      })
      const [t1Bowlers, t2Bowlers, t1Scores, t2Scores, t1AvgMap, t2AvgMap] = await Promise.all([
        getDocs(query(collection(db, 'bowlers'), where('teamId', '==', t1Id), where('seasonYear', '==', seasonYear))),
        getDocs(query(collection(db, 'bowlers'), where('teamId', '==', t2Id), where('seasonYear', '==', seasonYear))),
        getDocs(query(collection(db, 'bowlerScores'), where('teamId', '==', t1Id), where('seasonYear', '==', seasonYear), where('week', '==', selectedWeek))),
        getDocs(query(collection(db, 'bowlerScores'), where('teamId', '==', t2Id), where('seasonYear', '==', seasonYear), where('week', '==', selectedWeek))),
        loadCurrentAvgs(t1Id, selectedWeek as number),
        loadCurrentAvgs(t2Id, selectedWeek as number),
      ])

      const t1RosterIds = new Set(t1Bowlers.docs.map(d => d.id))
      const t2RosterIds = new Set(t2Bowlers.docs.map(d => d.id))
      const t1ScoreDocs = t1Scores.docs.map(sd => sd.data() as BowlerScore)
      const t2ScoreDocs = t2Scores.docs.map(sd => sd.data() as BowlerScore)
      const t1SubRows = extractSubRows(t1ScoreDocs, t1RosterIds, t1Id, d.team1?.teamName ?? '', seasonYear)
      const t2SubRows = extractSubRows(t2ScoreDocs, t2RosterIds, t2Id, d.team2?.teamName ?? '', seasonYear)

      setLeftBowlers([
        ...applyCurrentAvgs(t1Bowlers.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)), t1AvgMap),
        ...t1SubRows,
      ])
      setRightBowlers([
        ...applyCurrentAvgs(t2Bowlers.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)), t2AvgMap),
        ...t2SubRows,
      ])
      setLeftSubRowIds(new Set(t1SubRows.map(b => b.id!)))
      setRightSubRowIds(new Set(t2SubRows.map(b => b.id!)))

      const buildInputs = (snap: typeof t1Scores) => {
        const inputs: ScoreInputs = {}
        const eDocs: Record<string, string> = {}
        for (const doc of snap.docs) {
          const bs = doc.data() as BowlerScore
          // Back-compat: old records have blinded=true but no per-game flags
          const b1 = bs.blind1 ?? bs.blinded ?? false
          const b2 = bs.blind2 ?? bs.blinded ?? false
          const b3 = bs.blind3 ?? bs.blinded ?? false
          inputs[bs.bowlerId] = {
            avg: bs.avgBeforeThisWeek != null ? String(bs.avgBeforeThisWeek) : '',
            g1: b1 ? '' : (bs.game1 != null ? String(bs.game1) : ''),
            g2: b2 ? '' : (bs.game2 != null ? String(bs.game2) : ''),
            g3: b3 ? '' : (bs.game3 != null ? String(bs.game3) : ''),
            blind1: b1, blind2: b2, blind3: b3,
          }
          eDocs[bs.bowlerId] = doc.id
        }
        return { inputs, eDocs }
      }

      const { inputs: li, eDocs: ld } = buildInputs(t1Scores)
      const { inputs: ri, eDocs: rd } = buildInputs(t2Scores)
      setLeftScoreInputs(li)
      setLeftExistingDocs(ld)
      setRightScoreInputs(ri)
      setRightExistingDocs(rd)

      // Bowlers on the roster who have no score doc for this week start excluded.
      // This prevents empty roster slots from appearing as active and means the admin
      // only needs to act when something is wrong, not to re-select the obvious 4.
      const t1WithDocs = new Set(Object.keys(li))
      const t2WithDocs = new Set(Object.keys(ri))
      setLeftExcluded(new Set(t1Bowlers.docs.map(d => d.id).filter(id => !t1WithDocs.has(id))))
      setRightExcluded(new Set(t2Bowlers.docs.map(d => d.id).filter(id => !t2WithDocs.has(id))))

      // If left side has only team totals, switch to that mode and pre-fill
      if (d.team1?.individualScoresUnavailable) {
        setScoreEntryMode('teamTotals')
        setTeamTotalsInputs({
          g1: String(d.team1.game1Total), g2: String(d.team1.game2Total),
          g3: String(d.team1.game3Total),
          points: String(d.team1.points),
        })
      }
      // Vacant is always the non-editing side — if it's on the left (team1), flip right.
      if (isVacantTeam(d.team1?.teamName)) setEditingSide('right')
    } catch (err) {
      console.error('[DataCorrectionAdmin] handleExpandEntry:', err)
      setSaveError('Failed to load matchup data.')
    } finally {
      setLoadingExpanded(false)
    }
  }

  /**
   * Flips the active editing panel without re-fetching data.
   * Pre-fills team totals inputs from matchupDetail if the new side has them.
   */
  function handleSwitchSide() {
    const newSide: 'left' | 'right' = editingSide === 'left' ? 'right' : 'left'
    setEditingSide(newSide)
    setSaveMsg('')
    setSaveError('')
    setScoreEntryMode('individual')
    setTeamTotalsInputs({ g1: '', g2: '', g3: '', points: '' })

    if (expandedDetail) {
      const key = newSide === 'left' ? 'team1' : 'team2'
      const side = expandedDetail[key]
      if (side?.individualScoresUnavailable) {
        setScoreEntryMode('teamTotals')
        // game1Total/2/3 are with-hdcp when individualScoresUnavailable (handicapGame1/2/3=0)
        setTeamTotalsInputs({
          g1: String(side.game1Total),
          g2: String(side.game2Total),
          g3: String(side.game3Total),
          points: String(side.points),
        })
      }
    }
  }

  /**
   * Swaps which team occupies the odd (left) vs even (right) lane within the pair.
   * Physically writes team1←team2 and team2←team1 to the matchupDetail document,
   * then mirrors the swap in the editor panels so left/right remain coherent.
   * Only valid for saved matchupDetails — not applicable to orphan/missing entries.
   */
  async function handleSwapLanes() {
    if (!expandedEntry?.matchupDetailDocId || !expandedDetail) return
    setSwappingLanes(true)
    setSaveError('')
    setSaveMsg('')
    try {
      await updateDoc(doc(db, 'matchupDetails', expandedEntry.matchupDetailDocId), {
        team1: expandedDetail.team2,
        team2: expandedDetail.team1,
        adminOverride: true,
      })
      const swapped: MatchupDetail = {
        ...expandedDetail,
        team1: expandedDetail.team2,
        team2: expandedDetail.team1,
      }
      setWeekEntries(prev => prev.map(e =>
        e.id !== expandedEntryId ? e : { ...e, matchupDetail: swapped }
      ))
      // Capture current panel state before overwriting
      const prevLeftBowlers     = leftBowlers
      const prevLeftInputs      = leftScoreInputs
      const prevLeftDocs        = leftExistingDocs
      const prevLeftExcluded    = leftExcluded
      const prevLeftSubRowIds   = leftSubRowIds
      const prevRightBowlers    = rightBowlers
      const prevRightInputs     = rightScoreInputs
      const prevRightDocs       = rightExistingDocs
      const prevRightExcluded   = rightExcluded
      const prevRightSubRowIds  = rightSubRowIds
      setLeftBowlers(prevRightBowlers)
      setRightBowlers(prevLeftBowlers)
      setLeftScoreInputs(prevRightInputs)
      setRightScoreInputs(prevLeftInputs)
      setLeftExistingDocs(prevRightDocs)
      setRightExistingDocs(prevLeftDocs)
      setLeftExcluded(prevRightExcluded)
      setRightExcluded(prevLeftExcluded)
      setLeftSubRowIds(prevRightSubRowIds)
      setRightSubRowIds(prevLeftSubRowIds)
      setEditingSide('left')
      setScoreEntryMode('individual')
      setTeamTotalsInputs({ g1: '', g2: '', g3: '', points: '' })
      setSaveMsg('Lane assignment swapped.')
    } catch (err) {
      console.error('[DataCorrectionAdmin] handleSwapLanes:', err)
      setSaveError('Failed to swap lanes.')
    } finally {
      setSwappingLanes(false)
    }
  }

  // ── Add Sub ─────────────────────────────────────────────────────────────────

  /** Loads the league-wide substitute pool for this season, once. */
  async function loadSubPool() {
    if (subPool.length > 0 || loadingSubPool) return
    setLoadingSubPool(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'bowlers'), where('seasonYear', '==', seasonYear), where('isSubPool', '==', true))
      )
      setSubPool(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)))
    } catch {
      setSaveError('Failed to load substitute list.')
    } finally {
      setLoadingSubPool(false)
    }
  }

  /**
   * Adds a substitute as an active row on the currently-editing side for this matchup only.
   * The manually entered weekly average drives their handicap contribution via the
   * same blindBaseAvg() path every other bowler uses — no separate handicap logic needed.
   * A new substitute's entering average is stored separately on their pool profile.
   * Picking an existing sub-pool bowler reuses their doc ID; typing a new name creates one.
   */
  async function handleAddSub() {
    const weeklyAvg = parseInt(addSubForm.weeklyAvg) || 0
    if (!weeklyAvg) { setSaveError('Enter the substitute\'s average for this week.'); return }

    let subBowler: Bowler
    setSavingSub(true)
    setSaveError('')
    try {
      if (addSubForm.subId) {
        const existing = subPool.find(b => b.id === addSubForm.subId)
        if (!existing) { setSaveError('Substitute not found.'); return }
        subBowler = existing
      } else {
        const firstName = addSubForm.firstName.trim()
        const lastName = addSubForm.lastName.trim()
        const enteringAvg = parseInt(addSubForm.enteringAvg) || 0
        if (!firstName || !lastName) { setSaveError('Enter the new substitute\'s name.'); return }
        if (!enteringAvg) { setSaveError('Enter the new substitute\'s entering average.'); return }
        const name = `${firstName} ${lastName}`
        const data = {
          leaguePalsId: `admin-sub-${Date.now()}`, seasonYear, teamId: '', teamName: '',
          firstName, lastName, name, avatarUrl: null,
          average: enteringAvg, averageFloat: enteringAvg, enteringAvg, enteringAvgSeason: seasonYear,
          highGame: 0, highGameHdcp: 0, highSeries: 0, highSeriesHdcp: 0, gamesPlayed: 0,
          blindWeeksTotal: 0, blindWeeksRow: 0, indPointsWon: 0, adminOverride: true, isSubPool: true,
        }
        const ref = doc(collection(db, 'bowlers'))
        if (isLocalAdminBypass()) {
          await localAdminWrite({ operation: 'add-substitute-bowler', docId: ref.id, bowler: data })
        } else {
          await setDoc(ref, data)
        }
        subBowler = { ...data, id: ref.id }
        setSubPool(prev => [...prev, subBowler])
      }

      const activeIds = new Set(activeBowlers.map(b => b.id))
      if (activeIds.has(subBowler.id)) { setSaveError(`${subBowler.name} is already in this week's lineup.`); return }

      const row: Bowler = {
        ...subBowler,
        teamId: activeTeamId,
        teamName: activeTeam?.name ?? '',
        average: weeklyAvg,
        averageFloat: weeklyAvg,
      }
      if (editingSide === 'left') {
        setLeftBowlers(prev => [...prev, row])
        setLeftScoreInputs(prev => ({ ...prev, [row.id!]: { avg: String(weeklyAvg), g1: '', g2: '', g3: '', blind1: false, blind2: false, blind3: false } }))
      } else {
        setRightBowlers(prev => [...prev, row])
        setRightScoreInputs(prev => ({ ...prev, [row.id!]: { avg: String(weeklyAvg), g1: '', g2: '', g3: '', blind1: false, blind2: false, blind3: false } }))
      }
      setActiveSubRowIds(prev => new Set(prev).add(row.id!))
      setShowAddSubForm(false)
      setAddSubForm({ subId: '', firstName: '', lastName: '', enteringAvg: '', weeklyAvg: '' })
    } catch (error) {
      console.error('[DataCorrectionAdmin] Failed to add substitute:', error)
      setSaveError('Failed to add substitute.')
    } finally {
      setSavingSub(false)
    }
  }

  /** Fully removes a sub row added this session — unlike "exclude", it has no roster slot to preserve. */
  async function handleRemoveSubRow(bowlerId: string) {
    if (editingSide === 'left') {
      setLeftBowlers(prev => prev.filter(b => b.id !== bowlerId))
      setLeftScoreInputs(prev => { const n = { ...prev }; delete n[bowlerId]; return n })
    } else {
      setRightBowlers(prev => prev.filter(b => b.id !== bowlerId))
      setRightScoreInputs(prev => { const n = { ...prev }; delete n[bowlerId]; return n })
    }
    setActiveSubRowIds(prev => { const n = new Set(prev); n.delete(bowlerId); return n })
    const existingId = activeExistingDocs[bowlerId]
    if (existingId) {
      try {
        await deleteDoc(doc(db, 'bowlerScores', existingId))
      } catch {
        setSaveError('Failed to remove substitute score.')
      }
      if (editingSide === 'left') {
        setLeftExistingDocs(prev => { const n = { ...prev }; delete n[bowlerId]; return n })
      } else {
        setRightExistingDocs(prev => { const n = { ...prev }; delete n[bowlerId]; return n })
      }
    }
  }

  // ── Orphan opponent selection ──────────────────────────────────────────────

  async function handleOrphanOpponentSelect(opponentId: string) {
    setOrphanOpponentId(opponentId)
    if (!opponentId || !selectedWeek) return
    // Vacant teams have no roster or scores — skip the Firestore fetch entirely.
    const oppTeamName = teams.find(t => t.id === opponentId)?.name
    if (isVacantTeam(oppTeamName)) return
    setLoadingOrphanOpp(true)
    try {
      const [bSnap, sSnap, rightAvgMap] = await Promise.all([
        getDocs(query(collection(db, 'bowlers'), where('teamId', '==', opponentId), where('seasonYear', '==', seasonYear))),
        getDocs(query(collection(db, 'bowlerScores'), where('teamId', '==', opponentId), where('seasonYear', '==', seasonYear), where('week', '==', selectedWeek))),
        loadCurrentAvgs(opponentId, selectedWeek as number),
      ])
      const rightRosterIds = new Set(bSnap.docs.map(d => d.id))
      const rightScoreDocs = sSnap.docs.map(sd => sd.data() as BowlerScore)
      const rightSubRows = extractSubRows(rightScoreDocs, rightRosterIds, opponentId, oppTeamName ?? '', seasonYear)
      setRightBowlers([
        ...applyCurrentAvgs(bSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)), rightAvgMap),
        ...rightSubRows,
      ])
      setRightSubRowIds(new Set(rightSubRows.map(b => b.id!)))
      const inputs: ScoreInputs = {}
      const eDocs: Record<string, string> = {}
      for (const d of sSnap.docs) {
        const bs = d.data() as BowlerScore
        const b1 = bs.blind1 ?? bs.blinded ?? false
        const b2 = bs.blind2 ?? bs.blinded ?? false
        const b3 = bs.blind3 ?? bs.blinded ?? false
        inputs[bs.bowlerId] = {
          avg: bs.avgBeforeThisWeek != null ? String(bs.avgBeforeThisWeek) : '',
          g1: b1 ? '' : (bs.game1 != null ? String(bs.game1) : ''),
          g2: b2 ? '' : (bs.game2 != null ? String(bs.game2) : ''),
          g3: b3 ? '' : (bs.game3 != null ? String(bs.game3) : ''),
          blind1: b1, blind2: b2, blind3: b3,
        }
        eDocs[bs.bowlerId] = d.id
      }
      setRightScoreInputs(inputs)
      setRightExistingDocs(eDocs)
      // Roster bowlers without a score doc start excluded.
      const rightWithDocs = new Set(Object.keys(inputs))
      setRightExcluded(new Set(bSnap.docs.map(d => d.id).filter(id => !rightWithDocs.has(id))))
    } catch {
      setSaveError('Failed to load opponent data.')
    } finally {
      setLoadingOrphanOpp(false)
    }
  }

  // ── Live totals ────────────────────────────────────────────────────────────

  /** Recalculates scratch/handicap/total as the admin types in individual mode. */
  const liveTotals = useMemo(() => {
    if (scoreEntryMode !== 'individual') return null
    let g1 = 0, g2 = 0, g3 = 0, teamAvg = 0, count = 0
    const bowlerAverages: number[] = []
    for (const b of activeBowlers) {
      // Skip bowlers explicitly marked as not bowling this week.
      if (activeExcluded.has(b.id!)) continue
      const s = activeScoreInputs[b.id!]
      const blindAvg = weeklyAvg(b, s)
      const bv  = blindAvg > 0 ? blindAvg - Math.floor(blindAvg * BLIND_PENALTY_PCT) : 0
      const v1 = s?.blind1 ? bv : (parseInt(s?.g1 ?? '') || 0)
      const v2 = s?.blind2 ? bv : (parseInt(s?.g2 ?? '') || 0)
      const v3 = s?.blind3 ? bv : (parseInt(s?.g3 ?? '') || 0)
      if (v1 === 0 && v2 === 0 && v3 === 0) continue
      count++
      g1 += v1; g2 += v2; g3 += v3
      // New bowlers (no current-season avg yet): derive their average from actual games this week.
      // If any game is blinded the avg is indeterminate — contribute 0 so Vacant formula
      // doesn't double-count a blind score as a real bowling performance.
      const effectiveAvg = blindAvg > 0 ? blindAvg
        : (s?.blind1 || s?.blind2 || s?.blind3) ? 0
        : Math.floor((v1 + v2 + v3) / 3)
      teamAvg += effectiveAvg
      bowlerAverages.push(effectiveAvg)
    }
    if (count === 0) return null
    const oppAvg = expandedDetail?.[oppSideKey]?.teamAvg ?? 0
    // Guard: if teamAvg is 0 (bowlers have no entering average), skip handicap
    // to avoid computing a wildly inflated hdcp against the opponent's avg.
    const autoHdcp = teamAvg === 0 ? 0
      : calculateGameHandicap({ teamAvg, opponentAvg: oppAvg, bowlerAverages }, leagueConfig ?? undefined)
    const hdcp = isOpponentVacant ? 0 : (activeHandicapOverride ?? autoHdcp)
    const scratch = g1 + g2 + g3
    return {
      g1, g2, g3, scratch, teamAvg, autoHdcp, hdcp,
      handicapPinned: activeHandicapOverride != null,
      hdcpSeries: hdcp * 3, total: scratch + hdcp * 3, count,
    }
  }, [
    activeBowlers, activeScoreInputs, expandedDetail, oppSideKey, scoreEntryMode,
    activeExcluded, activeHandicapOverride, isOpponentVacant, leagueConfig,
  ])

  /**
   * Recalculates totals as the admin types in team totals mode.
   * g1/g2/g3 are the game totals WITH handicap already included — no separate
   * hdcp field. Series is simply g1+g2+g3.
   */
  const liveTeamTotals = useMemo(() => {
    if (scoreEntryMode !== 'teamTotals') return null
    const g1 = parseInt(teamTotalsInputs.g1) || 0
    const g2 = parseInt(teamTotalsInputs.g2) || 0
    const g3 = parseInt(teamTotalsInputs.g3) || 0
    if (g1 === 0 && g2 === 0 && g3 === 0) return null
    return { g1, g2, g3, total: g1 + g2 + g3 }
  }, [scoreEntryMode, teamTotalsInputs])

  /**
   * Vacant team score = floor(sum of active opposing bowlers' entering avgs × 0.90).
   * Same value for G1, G2, G3. Null when Vacant is not the opponent or no avgs available.
   * Uses liveTotals.teamAvg in individual mode (most accurate: only bowlers with scores),
   * falls back to non-excluded roster sum in team-totals mode.
   */
  const liveVacantScore = useMemo((): number | null => {
    if (!isOpponentVacant) return null
    const avgSum = scoreEntryMode === 'individual' && liveTotals
      ? liveTotals.teamAvg
      : (() => {
          const eSum = activeBowlers
            .filter(b => !activeExcluded.has(b.id!))
            .reduce((sum, b) => sum + weeklyAvg(b, activeScoreInputs[b.id!]), 0)
          if (eSum > 0) return eSum
          // No current-season avgs (all new bowlers): team scratch total / 3 games = avg sum
          return liveTeamTotals
            ? Math.floor((liveTeamTotals.g1 + liveTeamTotals.g2 + liveTeamTotals.g3) / 3)
            : 0
        })()
    return avgSum > 0 ? Math.floor(avgSum * 0.90) : null
  }, [isOpponentVacant, scoreEntryMode, liveTotals, liveTeamTotals, activeBowlers, activeExcluded])

  /**
   * Opponent's with-handicap game totals. Used as the baseline for auto-point
   * calculation. Returns null when opponent data is not yet available.
   */
  const opponentDisplayTotals = useMemo(() => {
    if (!expandedEntry) return null

    if (expandedDetail) {
      const s = expandedDetail[oppSideKey]
      if (!s) return null
      return {
        g1: s.game1Total + s.handicapGame1,
        g2: s.game2Total + s.handicapGame2,
        g3: s.game3Total + s.handicapGame3,
        total: s.totalSeries,
      }
    }

    // Vacant opponent without a stored matchupDetail yet — use the live formula score
    // so autoPoints can be shown before the first save.
    if (isOpponentVacant && liveVacantScore != null) {
      return {
        g1: liveVacantScore, g2: liveVacantScore, g3: liveVacantScore,
        total: liveVacantScore * 3,
      }
    }

    // Fall back to summing opponent's bowlerScore inputs
    const oppBowlers = editingSide === 'left' ? rightBowlers : leftBowlers
    const oppInputs  = editingSide === 'left' ? rightScoreInputs : leftScoreInputs
    let g1 = 0, g2 = 0, g3 = 0
    const oppBowlerAverages: number[] = []
    for (const b of oppBowlers) {
      const s = oppInputs[b.id!]
      const bg1 = parseInt(s?.g1 ?? '') || 0
      const bg2 = parseInt(s?.g2 ?? '') || 0
      const bg3 = parseInt(s?.g3 ?? '') || 0
      g1 += bg1; g2 += bg2; g3 += bg3
      if (bg1 || bg2 || bg3) oppBowlerAverages.push(weeklyAvg(b, s))
    }
    if (g1 === 0 && g2 === 0 && g3 === 0) return null

    // Compute opponent's handicap relative to the active team's avg
    const myTeamAvg = activeBowlers.reduce((sum, b) => sum + weeklyAvg(b, activeScoreInputs[b.id!]), 0)
    const oppTeamId  = editingSide === 'left' ? rightTeamId : leftTeamId
    const oppTeam    = teams.find(t => t.id === oppTeamId)
    const oppAvg     = oppTeam?.average ?? 0
    const oppHdcp    = calculateGameHandicap(
      { teamAvg: oppAvg, opponentAvg: myTeamAvg, bowlerAverages: oppBowlerAverages }, leagueConfig ?? undefined,
    )
    return {
      g1: g1 + oppHdcp,
      g2: g2 + oppHdcp,
      g3: g3 + oppHdcp,
      total: g1 + g2 + g3 + oppHdcp * 3,
    }
  }, [
    expandedEntry, expandedDetail, oppSideKey, editingSide,
    isOpponentVacant, liveVacantScore,
    rightBowlers, leftBowlers, rightScoreInputs, leftScoreInputs,
    activeBowlers, teams, rightTeamId, leftTeamId,
  ])

  /**
   * Auto-computed points (0–4) for the editing side based on game-by-game
   * head-to-head with handicap. Null when opponent totals are unavailable.
   */
  const autoPoints = useMemo((): number | null => {
    if (!opponentDisplayTotals) return null
    let myG1: number, myG2: number, myG3: number, myTotal: number
    if (scoreEntryMode === 'individual' && liveTotals) {
      myG1   = liveTotals.g1 + liveTotals.hdcp
      myG2   = liveTotals.g2 + liveTotals.hdcp
      myG3   = liveTotals.g3 + liveTotals.hdcp
      myTotal = liveTotals.total
    } else if (scoreEntryMode === 'teamTotals' && liveTeamTotals) {
      // g1/g2/g3 are already the with-handicap totals
      myG1    = liveTeamTotals.g1
      myG2    = liveTeamTotals.g2
      myG3    = liveTeamTotals.g3
      myTotal = liveTeamTotals.total
    } else {
      return null
    }
    return (
      gPoint(myG1,   opponentDisplayTotals.g1) +
      gPoint(myG2,   opponentDisplayTotals.g2) +
      gPoint(myG3,   opponentDisplayTotals.g3) +
      gPoint(myTotal, opponentDisplayTotals.total)
    )
  }, [opponentDisplayTotals, scoreEntryMode, liveTotals, liveTeamTotals])

  // ── Save individual scores ─────────────────────────────────────────────────

  async function handleSaveScores() {
    if (!liveTotals || !activeTeam || !selectedWeek) return
    setSavingScores(true)
    setSaveError('')
    setSaveMsg('')
    try {
      const localWrites: Array<{
        collection: 'bowlerScores' | 'matchupDetails'
        docId: string
        data?: Record<string, unknown>
        merge?: boolean
        operation: 'set' | 'delete'
      }> = []
      const saveDoc = async (
        collectionName: 'bowlerScores' | 'matchupDetails',
        docId: string,
        data: Record<string, unknown>,
        merge = false,
      ) => {
        if (LOCAL_ADMIN_BYPASS) {
          localWrites.push({ collection: collectionName, docId, data, merge, operation: 'set' })
        } else {
          await setDoc(doc(db, collectionName, docId), data, { merge })
        }
      }
      const removeDoc = async (collectionName: 'bowlerScores' | 'matchupDetails', docId: string) => {
        if (LOCAL_ADMIN_BYPASS) {
          localWrites.push({ collection: collectionName, docId, operation: 'delete' })
        } else {
          await deleteDoc(doc(db, collectionName, docId))
        }
      }
      const weekDate = scheduleWeeks.find(sw => sw.week === selectedWeek)?.date ?? ''
      const opponentTeamId = expandedDetail?.[oppSideKey]?.teamId ?? ''
      const opponentTeamName = expandedDetail?.[oppSideKey]?.teamName ?? ''
      const myLane = parseInt(laneInput) || (expandedDetail?.[activeSideKey]?.lane ?? 0)
      const matchupId = expandedDetail?.matchupId ?? ''

      const handicapOverrideRaw = activeHandicapOverrideInput.trim()
      if (handicapOverrideRaw !== '') {
        const value = Number(handicapOverrideRaw)
        if (!Number.isInteger(value) || value < 0 || value > 999) {
          setSaveError('Pinned handicap must be a whole number from 0 to 999, or blank for Auto.')
          return
        }
      }

      const invalidAvgBowler = activeBowlers.find(b => {
        if (activeExcluded.has(b.id!)) return false
        const raw = activeScoreInputs[b.id!]?.avg?.trim() ?? ''
        if (raw === '') return false
        const value = Number(raw)
        return !Number.isInteger(value) || value < 0 || value > 300
      })
      if (invalidAvgBowler) {
        setSaveError(`${invalidAvgBowler.name}'s weekly average must be a whole number from 0 to 300.`)
        return
      }

      // Pre-validation: count bowlers that would be written (have any score or blind).
      // A team may have at most 4 bowlers per game; reject before touching Firestore.
      const activeCount = activeBowlers.filter(b => {
        if (activeExcluded.has(b.id!)) return false
        const s = activeScoreInputs[b.id!]
        if (!s) return false
        const avg = weeklyAvg(b, s)
        const bv  = avg > 0 ? avg - Math.floor(avg * BLIND_PENALTY_PCT) : 0
        const g1  = s.blind1 ? bv : (parseInt(s.g1 ?? '') || 0)
        const g2  = s.blind2 ? bv : (parseInt(s.g2 ?? '') || 0)
        const g3  = s.blind3 ? bv : (parseInt(s.g3 ?? '') || 0)
        return s.blind1 || s.blind2 || s.blind3 || g1 > 0 || g2 > 0 || g3 > 0
      }).length
      if (activeCount > 4) {
        setSaveError(
          `${activeCount} bowlers have scores or blinds — a team may have at most 4. ` +
          `Remove blinds or clear scores for ${activeCount - 4} bowler(s) before saving.`
        )
        return
      }

      type AB = { bowler: Bowler; avg: number; g1: number; g2: number; g3: number }
      const active: AB[] = []

      for (const b of activeBowlers) {
        if (activeExcluded.has(b.id!)) {
          // Marked as not bowling — delete any existing Firestore doc so it doesn't linger.
          const existingId = activeExistingDocs[b.id!]
          if (existingId) {
            await removeDoc('bowlerScores', existingId)
            if (editingSide === 'left') {
              setLeftExistingDocs(prev => { const n = { ...prev }; delete n[b.id!]; return n })
            } else {
              setRightExistingDocs(prev => { const n = { ...prev }; delete n[b.id!]; return n })
            }
          }
          continue
        }
        const s = activeScoreInputs[b.id!]
        const isB1 = s?.blind1 ?? false
        const isB2 = s?.blind2 ?? false
        const isB3 = s?.blind3 ?? false
        const isBlinded = isB1 && isB2 && isB3
        const avg = weeklyAvg(b, s)
        const bv  = avg > 0 ? avg - Math.floor(avg * BLIND_PENALTY_PCT) : 0
        const g1 = isB1 ? bv : (parseInt(s?.g1 ?? '') || 0)
        const g2 = isB2 ? bv : (parseInt(s?.g2 ?? '') || 0)
        const g3 = isB3 ? bv : (parseInt(s?.g3 ?? '') || 0)
        // Bowler has no scores and no blind flags — they didn't bowl this week.
        // If an existing Firestore doc remains (e.g. a previously-checked blind that
        // was just unchecked), delete it so the change persists on reload.
        if (!isB1 && !isB2 && !isB3 && g1 === 0 && g2 === 0 && g3 === 0) {
          const existingId = activeExistingDocs[b.id!]
          if (existingId) {
            await removeDoc('bowlerScores', existingId)
            if (editingSide === 'left') {
              setLeftExistingDocs(prev => { const n = { ...prev }; delete n[b.id!]; return n })
            } else {
              setRightExistingDocs(prev => { const n = { ...prev }; delete n[b.id!]; return n })
            }
          }
          continue
        }
        active.push({ bowler: b, avg, g1, g2, g3 })
        const isSub = activeSubRowIds.has(b.id!)
        const scoreData: Omit<BowlerScore, 'id'> = {
          bowlerId: b.id!, bowlerName: b.name,
          teamId: activeTeamId, teamName: activeTeam.name,
          opponentTeamId, opponentTeamName, matchupId,
          seasonYear, week: selectedWeek as number, date: weekDate, actualBowlDate: weekDate,
          lanePair: myLane, game1: g1, game2: g2, game3: g3, series: g1 + g2 + g3,
          preBowled: false, blinded: isBlinded, blind1: isB1, blind2: isB2, blind3: isB3,
          isSubstitute: isSub, substituteFor: null, substituteAvg: isSub ? avg : null,
          avgBeforeThisWeek: avg,
          rollingAvg: null, rollingGames: 0, adminOverride: true,
        }
        // Deterministic doc ID matches the pipeline format (bowlerId_wNN) so admin
        // saves overwrite the pipeline doc rather than creating a parallel document.
        const scoreDocId = `${b.id}_w${String(selectedWeek as number).padStart(2, '0')}`
        const existingId = activeExistingDocs[b.id!] ?? scoreDocId
        await saveDoc('bowlerScores', existingId, scoreData, !!activeExistingDocs[b.id!])
        if (!activeExistingDocs[b.id!]) {
          if (editingSide === 'left') {
            setLeftExistingDocs(prev => ({ ...prev, [b.id!]: scoreDocId }))
          } else {
            setRightExistingDocs(prev => ({ ...prev, [b.id!]: scoreDocId }))
          }
        }
      }

      if (expandedEntry?.matchupDetailDocId && expandedDetail) {
        const game1Total = active.reduce((s, b) => s + b.g1, 0)
        const game2Total = active.reduce((s, b) => s + b.g2, 0)
        const game3Total = active.reduce((s, b) => s + b.g3, 0)
        const scratchSeries = game1Total + game2Total + game3Total
        const myTeamAvg = active.reduce((sum, b) => sum + b.avg, 0)
        const myBowlerAverages = active.map(b => b.avg)

        // Derive opponent team avg from the bowlers already loaded in memory.
        // matchupDetail.teamAvg can be 0 or stale (e.g. first-time admin save,
        // or bowlers whose enteringAvg was never set), which would cause
        // oppHdcp = myTeamAvg * 0.85 — a huge inflated value that "doubles"
        // the opponent's totalSeries.  Using the loaded bowler documents is
        // always more reliable.
        const oppBowlersList = editingSide === 'left' ? rightBowlers : leftBowlers
        const oppScoreInputsMap = editingSide === 'left' ? rightScoreInputs : leftScoreInputs
        const oppExcludedSet = editingSide === 'left' ? rightExcluded : leftExcluded
        // Only count bowlers who have score data AND are not excluded from the opponent's lineup.
        const oppActiveBowlers = oppBowlersList.filter(b => oppScoreInputsMap[b.id!] && !oppExcludedSet.has(b.id!))
        const oppComputedTeamAvg = oppActiveBowlers.reduce(
          (sum, b) => sum + weeklyAvg(b, oppScoreInputsMap[b.id!]), 0,
        )
        const oppBowlerAverages = oppActiveBowlers.map(b => weeklyAvg(b, oppScoreInputsMap[b.id!]))
        const oppAvg = oppComputedTeamAvg > 0
          ? oppComputedTeamAvg
          : (expandedDetail[oppSideKey]?.teamAvg ?? 0)

        // Skip handicap entirely if either side's avg is 0 — avoids inflated
        // totals when entering averages are missing for one or both teams.
        const skipHdcp = myTeamAvg === 0 || oppAvg === 0
        const calculatedMyHdcp = skipHdcp ? 0 : calculateGameHandicap(
          { teamAvg: myTeamAvg, opponentAvg: oppAvg, bowlerAverages: myBowlerAverages }, leagueConfig ?? undefined,
        )
        const calculatedOppHdcp = skipHdcp ? 0 : calculateGameHandicap(
          { teamAvg: oppAvg, opponentAvg: myTeamAvg, bowlerAverages: oppBowlerAverages }, leagueConfig ?? undefined,
        )
        const myPinnedHdcp = pinnedHandicap(handicapOverrideInputs[activeTeamId])
        const oppTeamId = expandedDetail[oppSideKey]?.teamId ?? ''
        const oppPinnedHdcp = pinnedHandicap(handicapOverrideInputs[oppTeamId])
        const isOppTeamTotals = !!expandedDetail[oppSideKey]?.individualScoresUnavailable
        const myHdcp = isOpponentVacant ? 0 : (myPinnedHdcp ?? calculatedMyHdcp)
        const oppHdcp = isOpponentVacant || isOppTeamTotals ? 0 : (oppPinnedHdcp ?? calculatedOppHdcp)
        // Vacant opponent — fixed score formula, no handicap, points computed from formula.
        // For new bowlers (no current-season avg), fall back to their actual week avg (games / 3).
        const vacantMyAvg = active.reduce((s, b) => {
          const ea = b.avg
          return s + (ea > 0 ? ea : Math.floor((b.g1 + b.g2 + b.g3) / 3))
        }, 0)
        const vacantScore = isOpponentVacant ? Math.floor(vacantMyAvg * 0.90) : 0
        const opponentSummary = expandedDetail[oppSideKey]
        const myPoints = isOpponentVacant ? (
          gPoint(game1Total + myHdcp, vacantScore) +
          gPoint(game2Total + myHdcp, vacantScore) +
          gPoint(game3Total + myHdcp, vacantScore) +
          gPoint(scratchSeries + myHdcp * 3, vacantScore * 3)
        ) : (
          gPoint(game1Total + myHdcp, opponentSummary.game1Total + oppHdcp) +
          gPoint(game2Total + myHdcp, opponentSummary.game2Total + oppHdcp) +
          gPoint(game3Total + myHdcp, opponentSummary.game3Total + oppHdcp) +
          gPoint(scratchSeries + myHdcp * 3, opponentSummary.scratchSeries + oppHdcp * 3)
        )
        const oppPoints = 4 - myPoints
        const lanePair = parseInt(laneInput) || (expandedDetail[activeSideKey]?.lane ?? 0)
        const updatedMy: TeamSummary = {
          ...expandedDetail[activeSideKey],
          lane: lanePair,
          teamAvg: myTeamAvg, game1Total, game2Total, game3Total,
          scratchSeries, handicapGame1: myHdcp, handicapGame2: myHdcp, handicapGame3: myHdcp, handicapSeries: myHdcp * 3,
          handicapOverride: myPinnedHdcp,
          totalSeries: scratchSeries + myHdcp * 3, points: myPoints,
          // Switching from team-totals mode back to individual scores: clear the flag
          // so the readonly panel uses the correct scratch+hdcp display branch.
          individualScoresUnavailable: false,
        }
        // Vacant side — fixed formula, no handicap.
        // Normal side — preserve team-totals flag or recalculate handicap.
        const updatedOpp: TeamSummary = isOpponentVacant ? {
          teamId: expandedDetail[oppSideKey]?.teamId ?? '',
          teamName: expandedDetail[oppSideKey]?.teamName ?? 'Vacant',
          lane: lanePair, teamAvg: 0,
          game1Total: vacantScore, game2Total: vacantScore, game3Total: vacantScore,
          scratchSeries: vacantScore * 3, handicapGame1: 0, handicapGame2: 0, handicapGame3: 0, handicapSeries: 0,
          handicapOverride: null,
          totalSeries: vacantScore * 3, points: oppPoints, individualScoresUnavailable: true,
        } : isOppTeamTotals ? {
          ...expandedDetail[oppSideKey],
          lane: lanePair,
          points: oppPoints,
        } : {
          ...expandedDetail[oppSideKey],
          lane: lanePair,
          teamAvg: oppAvg,
          handicapGame1: oppHdcp, handicapGame2: oppHdcp, handicapGame3: oppHdcp, handicapSeries: oppHdcp * 3,
          handicapOverride: oppPinnedHdcp,
          totalSeries: expandedDetail[oppSideKey].scratchSeries + oppHdcp * 3,
          points: oppPoints,
        }
        await saveDoc('matchupDetails', expandedEntry.matchupDetailDocId, {
          [activeSideKey]: updatedMy, [oppSideKey]: updatedOpp, adminOverride: true,
        }, true)
        setWeekEntries(prev => prev.map(e =>
          e.id !== expandedEntryId ? e
            : { ...e, matchupDetail: { ...expandedDetail, [activeSideKey]: updatedMy, [oppSideKey]: updatedOpp } }
        ))
      } else if (isOpponentVacant && active.length > 0) {
        // First save against a Vacant opponent — create the matchupDetail now so the
        // scorecard shows immediately without requiring a separate Team Totals save.
        const g1 = active.reduce((s, b) => s + b.g1, 0)
        const g2 = active.reduce((s, b) => s + b.g2, 0)
        const g3 = active.reduce((s, b) => s + b.g3, 0)
        const scratch = g1 + g2 + g3
        const currentAvgSum = active.reduce((sum, b) => sum + b.avg, 0)
        // Fall back to week avg for new bowlers with no current-season average.
        const teamAvgSum = currentAvgSum > 0 ? currentAvgSum
          : active.reduce((s, b) => s + Math.floor((b.g1 + b.g2 + b.g3) / 3), 0)
        const vs = Math.floor(teamAvgSum * 0.90)
        const lanePair = parseInt(laneInput) || 0
        const oppTeamId = editingSide === 'left' ? rightTeamId : leftTeamId
        const oppTeamName = editingSide === 'left' ? rightTeamName : leftTeamName
        const myPts = (
          gPoint(g1, vs) + gPoint(g2, vs) + gPoint(g3, vs) + gPoint(scratch, vs * 3)
        )
        const myData: TeamSummary = {
          teamId: activeTeamId, teamName: activeTeam.name, lane: lanePair,
          teamAvg: teamAvgSum, game1Total: g1, game2Total: g2, game3Total: g3,
          scratchSeries: scratch, handicapGame1: 0, handicapGame2: 0, handicapGame3: 0, handicapSeries: 0,
          totalSeries: scratch, points: myPts, individualScoresUnavailable: false,
        }
        const vacantData: TeamSummary = {
          teamId: oppTeamId, teamName: oppTeamName, lane: lanePair,
          teamAvg: 0, game1Total: vs, game2Total: vs, game3Total: vs,
          scratchSeries: vs * 3, handicapGame1: 0, handicapGame2: 0, handicapGame3: 0, handicapSeries: 0,
          totalSeries: vs * 3, points: 4 - myPts, individualScoresUnavailable: true,
        }
        const newDetail: Omit<MatchupDetail, 'id'> = {
          matchupId: '', seasonYear, week: selectedWeek as number, date: weekDate,
          team1: activeSideKey === 'team1' ? myData : vacantData,
          team2: activeSideKey === 'team2' ? myData : vacantData,
          adminOverride: true,
        }
        const newDetailRef = doc(collection(db, 'matchupDetails'))
        await saveDoc('matchupDetails', newDetailRef.id, newDetail)
        const created = { ...newDetail, id: newDetailRef.id } as MatchupDetail
        setWeekEntries(prev => prev.map(e =>
          e.id !== expandedEntryId ? e
            : { ...e, type: 'matchup', matchupDetail: created, matchupDetailDocId: newDetailRef.id }
        ))
      }

      if (localWrites.length > 0) {
        await localAdminWrite({ operation: 'save-score-docs', writes: localWrites })
      }

      setSaveMsg(`Week ${selectedWeek} scores saved for ${activeTeam.name}.`)
      setShowSummary(true)
    } catch (err) {
      console.error('[DataCorrectionAdmin] handleSaveScores:', err)
      setSaveError('Failed to save scores.')
    } finally {
      setSavingScores(false)
    }
  }

  // ── Save team totals ───────────────────────────────────────────────────────

  async function handleSaveTeamTotals() {
    if (!liveTeamTotals || !activeTeam || !selectedWeek) return
    const pointsVal = parseFloat(teamTotalsInputs.points)
    const manualPoints = isNaN(pointsVal) ? 0 : Math.min(4, Math.max(0, pointsVal))
    const safePoints = autoPoints ?? manualPoints
    setSavingTeamTotals(true)
    setSaveError('')
    setSaveMsg('')

    // g1/g2/g3 are the final totals WITH handicap already included.
    // We don't know the scratch/hdcp split, so store hdcp fields as 0.
    const { g1, g2, g3, total } = liveTeamTotals
    const weekDate = scheduleWeeks.find(sw => sw.week === selectedWeek)?.date ?? ''

    try {
      if (expandedEntry?.matchupDetailDocId && expandedDetail) {
        const lanePair = parseInt(laneInput) || (expandedDetail[activeSideKey]?.lane ?? 0)
        // When opponent is Vacant, recompute their score from the active roster avgs
        // (team-totals mode gives no per-bowler data, so use roster + excluded set).
        const vacantAvgSum = (() => {
          if (!isOpponentVacant) return 0
          const eSum = activeBowlers
            .filter(b => !activeExcluded.has(b.id!))
            .reduce((sum, b) => sum + blindBaseAvg(b), 0)
          // No current-season avgs (new bowlers): team scratch / 3 games = avg sum
          return eSum > 0 ? eSum : Math.floor((g1 + g2 + g3) / 3)
        })()
        const vacantScore = isOpponentVacant ? Math.floor(vacantAvgSum * 0.90) : 0
        const finalPoints = isOpponentVacant ? (
          gPoint(g1, vacantScore) + gPoint(g2, vacantScore) +
          gPoint(g3, vacantScore) + gPoint(total, vacantScore * 3)
        ) : safePoints
        const updatedMy: TeamSummary = {
          ...expandedDetail[activeSideKey],
          lane: lanePair,
          game1Total: g1, game2Total: g2, game3Total: g3,
          scratchSeries: total, handicapGame1: 0, handicapGame2: 0, handicapGame3: 0, handicapSeries: 0,
          totalSeries: total, points: finalPoints, individualScoresUnavailable: true,
        }
        const updatedOpp: TeamSummary = isOpponentVacant ? {
          teamId: expandedDetail[oppSideKey]?.teamId ?? '',
          teamName: expandedDetail[oppSideKey]?.teamName ?? 'Vacant',
          lane: lanePair, teamAvg: 0,
          game1Total: vacantScore, game2Total: vacantScore, game3Total: vacantScore,
          scratchSeries: vacantScore * 3, handicapGame1: 0, handicapGame2: 0, handicapGame3: 0, handicapSeries: 0,
          totalSeries: vacantScore * 3, points: 4 - finalPoints, individualScoresUnavailable: true,
        } : { ...expandedDetail[oppSideKey], lane: lanePair, points: 4 - finalPoints }
        await updateDoc(doc(db, 'matchupDetails', expandedEntry.matchupDetailDocId), {
          [activeSideKey]: updatedMy, [oppSideKey]: updatedOpp, adminOverride: true,
        })
        setWeekEntries(prev => prev.map(e =>
          e.id !== expandedEntryId ? e
            : { ...e, matchupDetail: { ...expandedDetail, [activeSideKey]: updatedMy, [oppSideKey]: updatedOpp } }
        ))
        setSaveMsg(`Team totals saved for ${activeTeam.name}.`)
        setShowSummary(true)
      } else {
        // No matchupDetails — create one.
        const oppTeamId = orphanOpponentId || (editingSide === 'left' ? rightTeamId : leftTeamId)
        if (!oppTeamId) {
          setSaveError('Select an opponent team before saving.')
          setSavingTeamTotals(false)
          return
        }
        const oppTeam = teams.find(t => t.id === oppTeamId)
        const lanePair = parseInt(laneInput) || 0

        let finalPoints = safePoints
        let oppData: TeamSummary

        if (isOpponentVacant) {
          // Compute Vacant score from current avgs; fall back to team scratch / 3 for new bowlers.
          const eSum = activeBowlers
            .filter(b => !activeExcluded.has(b.id!))
            .reduce((sum, b) => sum + blindBaseAvg(b), 0)
          const avgSum = eSum > 0 ? eSum : Math.floor((g1 + g2 + g3) / 3)
          const vs = Math.floor(avgSum * 0.90)
          finalPoints = (
            gPoint(g1, vs) + gPoint(g2, vs) + gPoint(g3, vs) + gPoint(total, vs * 3)
          )
          oppData = {
            teamId: oppTeamId, teamName: oppTeam?.name ?? 'Vacant', lane: lanePair,
            teamAvg: 0, game1Total: vs, game2Total: vs, game3Total: vs,
            scratchSeries: vs * 3, handicapGame1: 0, handicapGame2: 0, handicapGame3: 0, handicapSeries: 0,
            totalSeries: vs * 3, points: 4 - finalPoints, individualScoresUnavailable: true,
          }
        } else {
          // Normal path — fetch opponent's existing bowlerScores.
          const oppAvg = oppTeam?.average ?? 0
          let oppG1 = 0, oppG2 = 0, oppG3 = 0
          if (oppTeamId) {
            const oppSnap = await getDocs(
              query(collection(db, 'bowlerScores'), where('teamId', '==', oppTeamId), where('seasonYear', '==', seasonYear), where('week', '==', selectedWeek))
            )
            for (const d of oppSnap.docs) {
              const bs = d.data() as BowlerScore
              oppG1 += bs.game1 ?? 0; oppG2 += bs.game2 ?? 0; oppG3 += bs.game3 ?? 0
            }
          }
          const oppScratch = oppG1 + oppG2 + oppG3
          oppData = {
            teamId: oppTeamId, teamName: oppTeam?.name ?? 'Opponent', lane: lanePair,
            teamAvg: oppAvg, game1Total: oppG1, game2Total: oppG2, game3Total: oppG3,
            scratchSeries: oppScratch, handicapGame1: 0, handicapGame2: 0, handicapGame3: 0, handicapSeries: 0,
            totalSeries: oppScratch, points: 4 - finalPoints,
          }
        }

        const myData: TeamSummary = {
          teamId: activeTeamId, teamName: activeTeam.name, lane: lanePair,
          teamAvg: 0, game1Total: g1, game2Total: g2, game3Total: g3,
          scratchSeries: total, handicapGame1: 0, handicapGame2: 0, handicapGame3: 0, handicapSeries: 0,
          totalSeries: total, points: finalPoints, individualScoresUnavailable: true,
        }
        const newDetail: Omit<MatchupDetail, 'id'> = {
          matchupId: '', seasonYear, week: selectedWeek as number, date: weekDate,
          team1: activeSideKey === 'team1' ? myData : oppData,
          team2: activeSideKey === 'team2' ? myData : oppData,
          adminOverride: true,
        }
        const ref = await addDoc(collection(db, 'matchupDetails'), newDetail)
        const created = { ...newDetail, id: ref.id } as MatchupDetail
        setWeekEntries(prev => prev.map(e =>
          e.id !== expandedEntryId ? e
            : { ...e, type: 'matchup', matchupDetail: created, matchupDetailDocId: ref.id }
        ))
        setSaveMsg(`Matchup record created for ${activeTeam.name}.`)
        setShowSummary(true)
      }
    } catch (err) {
      console.error('[DataCorrectionAdmin] handleSaveTeamTotals:', err)
      setSaveError('Failed to save team totals.')
    } finally {
      setSavingTeamTotals(false)
    }
  }

  // ── Re-ingest selected week ────────────────────────────────────────────────

  function formatReingestOverrides(report: ReingestResponse): string {
    const items = [
      ...report.overrideSummary.matchupDetails,
      ...report.overrideSummary.bowlerScores,
    ]
    if (items.length === 0) return 'No manual admin edits were found for this week.'
    const shown = items.slice(0, 12).map(item => `- ${item.collection}/${item.docId}: ${item.label}`)
    const hidden = items.length > shown.length ? [`- +${items.length - shown.length} more manual edit(s)`] : []
    return [
      `${items.length} manual admin edit(s) will be replaced:`,
      ...shown,
      ...hidden,
    ].join('\n')
  }

  async function requestWeekReingest(confirm: boolean): Promise<ReingestResponse> {
    const token = await auth.currentUser?.getIdToken()
    if (!token && !LOCAL_ADMIN_BYPASS) {
      throw new Error('You must be signed in as an admin to re-ingest data.')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    } else {
      headers['X-Local-Admin-Bypass'] = 'true'
    }

    const res = await fetch('/api/reingest-week', {
      method: 'POST',
      headers,
      body: JSON.stringify({ seasonYear, week: selectedWeek, confirm }),
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(payload?.error ?? `Re-ingest failed (${res.status})`)
    }
    return payload as ReingestResponse
  }

  async function handleReingestWeek() {
    if (!selectedWeek || reingestingWeek) return
    setReingestingWeek(true)
    setSaveError('')
    setSaveMsg('')
    setReingestReport(null)
    setReingestStatus(`Fetching fresh LeaguePals data for Week ${selectedWeek}...`)

    try {
      const dryRun = await requestWeekReingest(false)
      setReingestReport(dryRun)
      setReingestStatus(
        dryRun.overrideSummary.count > 0
          ? `Review needed: ${dryRun.overrideSummary.count} manual edit(s) will be replaced.`
          : 'Fresh LeaguePals data is ready. No manual edits were found.'
      )

      const overrideWarning = formatReingestOverrides(dryRun)
      const proceed = window.confirm(
        `Re-ingest Week ${selectedWeek} from LeaguePals?\n\n` +
        `${overrideWarning}\n\n` +
        `Fresh data ready: ${dryRun.generated.matchupDetails} matchup detail(s), ` +
        `${dryRun.generated.bowlerScores} bowler score(s).\n\n` +
        `This replaces only Week ${selectedWeek} score data.`
      )
      if (!proceed) {
        setReingestStatus('Re-ingest cancelled. No data was changed.')
        return
      }

      setReingestStatus(`Replacing Week ${selectedWeek} scores in Firestore...`)
      const result = await requestWeekReingest(true)
      setReingestReport(result)
      setExpandedEntryId(null)
      resetEditorState()
      await loadWeekMatchups(selectedWeek as number)
      setReingestReport(result)
      setSaveMsg(
        `Week ${selectedWeek} re-ingested from LeaguePals: ` +
        `${result.writeSummary?.writtenMatchupDetails ?? 0} matchup detail(s), ` +
        `${result.writeSummary?.writtenBowlerScores ?? 0} bowler score(s).`
      )
      setReingestStatus(`Week ${selectedWeek} re-ingest complete.`)
    } catch (err) {
      console.error('[DataCorrectionAdmin] handleReingestWeek:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to re-ingest week data.')
      setReingestStatus('Re-ingest failed. See the error below.')
    } finally {
      setReingestingWeek(false)
    }
  }
  // ── Validate Matchups ──────────────────────────────────────────────────────

  /**
   * Scans every matchupDetail in the season against the bowlerScores collection.
   * A matchup is invalid when either team has ≠ 4 score docs, OR when the stored
   * game totals in matchupDetail don't match the sum of the actual bowlerScore docs
   * (stale totals — e.g. a blind doc was added after the pipeline wrote the record).
   * Uses a single bulk read of bowlerScores to minimise Firestore round-trips.
   *
   * @returns Populates validationResults and sets validationComplete when done.
   */
  async function runValidation() {
    setRunningValidation(true)
    setValidationResults([])
    setValidationComplete(false)
    setShowValidAll(false)
    try {
      // Bulk fetch both collections in parallel — one round-trip each.
      const [detailsSnap, scoresSnap] = await Promise.all([
        getDocs(query(collection(db, 'matchupDetails'), where('seasonYear', '==', seasonYear))),
        getDocs(query(collection(db, 'bowlerScores'), where('seasonYear', '==', seasonYear))),
      ])
      const details = detailsSnap.docs.map(d => ({ id: d.id, ...d.data() } as MatchupDetail))

      // Count bowlerScore docs per team per week: key = `teamId:week`
      const countMap = new Map<string, number>()
      // Sum game scores per team per week to detect stale matchupDetail totals
      const scoreSumMap = new Map<string, { g1: number; g2: number; g3: number }>()
      for (const d of scoresSnap.docs) {
        const bs = d.data() as BowlerScore
        const key = `${bs.teamId}:${bs.week}`
        countMap.set(key, (countMap.get(key) ?? 0) + 1)
        const prev = scoreSumMap.get(key) ?? { g1: 0, g2: 0, g3: 0 }
        scoreSumMap.set(key, {
          g1: prev.g1 + (bs.game1 ?? 0),
          g2: prev.g2 + (bs.game2 ?? 0),
          g3: prev.g3 + (bs.game3 ?? 0),
        })
      }

      // True when stored scratch game totals diverge from the sum of bowlerScore docs.
      // Only meaningful when count is exactly 4 and individual scores are present.
      const hasMismatch = (side: TeamSummary, week: number, count: number, isManual: boolean): boolean => {
        if (isManual || count !== 4) return false
        const sums = scoreSumMap.get(`${side.teamId}:${week}`)
        if (!sums) return false
        return (
          sums.g1 !== (side.game1Total ?? 0) ||
          sums.g2 !== (side.game2Total ?? 0) ||
          sums.g3 !== (side.game3Total ?? 0)
        )
      }

      const results: MatchupValidationResult[] = details
        .map(d => {
          const t1Count = countMap.get(`${d.team1.teamId}:${d.week}`) ?? 0
          const t2Count = countMap.get(`${d.team2.teamId}:${d.week}`) ?? 0
          const t1Manual = !!d.team1.individualScoresUnavailable
          const t2Manual = !!d.team2.individualScoresUnavailable
          const t1Mismatch = hasMismatch(d.team1, d.week, t1Count, t1Manual)
          const t2Mismatch = hasMismatch(d.team2, d.week, t2Count, t2Manual)
          return {
            week: d.week,
            matchupDetailId: d.id!,
            team1Name: d.team1.teamName,
            team1Id: d.team1.teamId,
            team2Name: d.team2.teamName,
            team2Id: d.team2.teamId,
            team1Count: t1Count,
            team2Count: t2Count,
            team1Manual: t1Manual,
            team2Manual: t2Manual,
            team1Mismatch: t1Mismatch,
            team2Mismatch: t2Mismatch,
            // A manual-entry side has no individual docs by design — exempt from count rule.
            // A side with correct count but stale stored totals is also invalid.
            valid: (t1Manual || t1Count === 4) && (t2Manual || t2Count === 4) && !t1Mismatch && !t2Mismatch,
          }
        })
        .sort((a, b) => a.week - b.week || a.team1Name.localeCompare(b.team1Name))

      setValidationResults(results)
      setValidationComplete(true)
    } catch (err) {
      console.error('[DataCorrectionAdmin] runValidation:', err)
    } finally {
      setRunningValidation(false)
    }
  }

  /**
   * Jumps to Edit Scores for the given week so the admin can fix the matchup.
   *
   * @param week - Week number to pre-select in Edit Scores mode
   */
  function handleFixMatchup(week: number) {
    setMode('scores')
    setSelectedWeek(week)
    setExpandedEntryId(null)
    resetEditorState()
    setSaveMsg('')
    setSaveError('')
  }

  /**
   * Auto-fixes all overcounted matchups (teams with > 4 bowlerScore docs).
   *
   * For each such team:
   *  1. Separates real scores (non-blind) from blind scores.
   *  2. Sorts blind docs by most rollingGames → highest rollingAvg.
   *  3. Keeps real scores + top N blinds to reach exactly 4 total.
   *  4. Deletes the excess blind docs from Firestore.
   *  5. Recomputes matchupDetail game totals, handicap, and points for both sides.
   *
   * Matchups where a team has fewer than 4 scores are skipped — those require
   * the admin to manually add missing data in Edit Scores.
   */
  /**
   * Auto-fixes ALL invalid matchups:
   *  - Overcounted (> 4 docs): `selectFourDocs` retains real scores + top-priority blinds;
   *    excess blind docs are deleted.
   *  - Undercounted (< 4 docs): absent bowlers synthesized as blind docs, sorted by
   *    most gamesPlayed then enteringAvg. Blind score = blindBaseAvg − floor(blindBaseAvg × BLIND_PENALTY_PCT).
   *  - Stale totals (count = 4 but stored game totals don't match sum of bowlerScores):
   *    no doc changes needed — the recompute step below corrects matchupDetail.
   *
   * After adjusting docs on both sides the matchupDetail game totals,
   * handicap, and points are recomputed and written back to Firestore.
   * Team-totals-only sides are skipped and their stored values are preserved.
   */
  async function handleAutoFix() {
    const allInvalid = validationResults.filter(r => !r.valid)
    if (allInvalid.length === 0) return

    if (!window.confirm(
      `Auto-fix all ${allInvalid.length} invalid matchup(s)?\n\n` +
      `• Over-counted teams (>4 scores): excess blind docs removed\n` +
      `• Under-counted teams (<4 scores): missing blind scores synthesized\n` +
      `• Stale totals (count correct but stored values wrong): recomputed from actual scores\n` +
      `• Scoreboard totals recomputed for every fixed matchup\n\n` +
      `Team-totals-only entries are skipped.`
    )) return

    setAutoFixRunning(true)
    setAutoFixMsg('')
    let fixed = 0, failed = 0

    // Minimal score shape used for totals computation after add/remove operations
    type ScoreTuple = { bowlerId: string; game1: number; game2: number; game3: number; substituteAvg: number | null }

    try {
      for (const result of allInvalid) {
        try {
          const [t1ScoresSnap, t2ScoresSnap, t1BowlersSnap, t2BowlersSnap, detailSnap] =
            await Promise.all([
              getDocs(query(collection(db, 'bowlerScores'),
                where('teamId', '==', result.team1Id),
                where('seasonYear', '==', seasonYear),
                where('week', '==', result.week)
              )),
              getDocs(query(collection(db, 'bowlerScores'),
                where('teamId', '==', result.team2Id),
                where('seasonYear', '==', seasonYear),
                where('week', '==', result.week)
              )),
              getDocs(query(collection(db, 'bowlers'),
                where('teamId', '==', result.team1Id),
                where('seasonYear', '==', seasonYear)
              )),
              getDocs(query(collection(db, 'bowlers'),
                where('teamId', '==', result.team2Id),
                where('seasonYear', '==', seasonYear)
              )),
              getDoc(doc(db, 'matchupDetails', result.matchupDetailId)),
            ])

          if (!detailSnap.exists()) { failed++; continue }
          const matchupDetail = { id: detailSnap.id, ...detailSnap.data() } as MatchupDetail

          const t1BowlerMap = new Map(t1BowlersSnap.docs.map(d => [d.id, d.data() as Bowler]))
          const t2BowlerMap = new Map(t2BowlersSnap.docs.map(d => [d.id, d.data() as Bowler]))

          const t1All = t1ScoresSnap.docs.map(d => ({ id: d.id, ...d.data() } as BowlerScore & { id: string }))
          const t2All = t2ScoresSnap.docs.map(d => ({ id: d.id, ...d.data() } as BowlerScore & { id: string }))

          // ── Shared reference metadata for any newly-synthesized blind docs ──
          // Use the first existing doc as the source for lane/date/matchupId since
          // all docs on the same week share those values.
          const refDoc = t1All[0] ?? t2All[0]
          const weekDate   = matchupDetail.date ?? refDoc?.date ?? ''
          const t1Lane     = matchupDetail.team1.lane ?? refDoc?.lanePair ?? 0
          const t2Lane     = matchupDetail.team2.lane ?? refDoc?.lanePair ?? 0
          const matchupId  = matchupDetail.matchupId ?? ''

          /**
           * Adjusts one team's docs to exactly 4 by removing excess blind docs
           * or synthesizing new blind docs for absent bowlers.
           *
           * @param existingDocs - Current bowlerScore docs for this team/week
           * @param bowlerMap    - Full roster keyed by bowler Firestore ID
           * @param sideDetail   - TeamSummary for this side from matchupDetail
           * @param teamId       - Firestore team document ID
           * @param opponentTeamId   - Opponent's team ID (for new doc FK)
           * @param opponentTeamName - Opponent's team name (for new doc FK)
           * @param lane         - Lane pair number for the week
           * @returns            - Final 4 score tuples for totals computation
           */
          const fixSide = async (
            existingDocs: Array<BowlerScore & { id: string }>,
            bowlerMap: Map<string, Bowler>,
            sideDetail: TeamSummary,
            teamId: string,
            opponentTeamId: string,
            opponentTeamName: string,
            lane: number,
          ): Promise<ScoreTuple[]> => {
            // Team-totals-only: no bowlerScore docs expected; leave untouched
            if (sideDetail.individualScoresUnavailable) {
              return []
            }

            let finalDocs: ScoreTuple[]

            if (existingDocs.length > 4) {
              // ── Overcounted: remove excess blind docs ──────────────────────
              const { keep, remove } = selectFourDocs(existingDocs)
              if (remove.length > 0) {
                await Promise.all(remove.map(d => deleteDoc(doc(db, 'bowlerScores', d.id))))
              }
              finalDocs = keep.map(d => ({
                bowlerId: d.bowlerId,
                game1: d.game1 ?? 0,
                game2: d.game2 ?? 0,
                game3: d.game3 ?? 0,
                substituteAvg: d.isSubstitute ? (d.substituteAvg ?? null) : null,
              }))
            } else if (existingDocs.length < 4) {
              // ── Undercounted: synthesize blind docs for absent bowlers ──────
              const presentIds = new Set(existingDocs.map(d => d.bowlerId))
              // Sort absent bowlers: most gamesPlayed first, then highest enteringAvg
              const absent = Array.from(bowlerMap.values())
                .filter(b => b.id && !presentIds.has(b.id))
                .sort((a, b) => {
                  const gDiff = (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0)
                  if (gDiff !== 0) return gDiff
                  return (b.enteringAvg ?? 0) - (a.enteringAvg ?? 0)
                })

              const needed = 4 - existingDocs.length
              const toSynthesize = absent.slice(0, needed)

              const newScores: ScoreTuple[] = []
              for (const b of toSynthesize) {
                const avg = blindBaseAvg(b)
                const blindScore = avg > 0 ? avg - Math.floor(avg * BLIND_PENALTY_PCT) : 0
                const scoreData: Omit<BowlerScore, 'id'> = {
                  bowlerId: b.id!,
                  bowlerName: b.name,
                  teamId,
                  teamName: sideDetail.teamName,
                  opponentTeamId,
                  opponentTeamName,
                  matchupId,
                  seasonYear,
                  week: result.week,
                  date: weekDate,
                  actualBowlDate: null,
                  lanePair: lane,
                  game1: blindScore,
                  game2: blindScore,
                  game3: blindScore,
                  series: blindScore * 3,
                  preBowled: false,
                  blinded: true,
                  blind1: true,
                  blind2: true,
                  blind3: true,
                  isSubstitute: false,
                  substituteFor: null,
                  substituteAvg: null,
                  rollingAvg: null,
                  rollingGames: b.gamesPlayed ?? 0,
                  adminOverride: true,
                }
                // Use the same deterministic ID as the pipeline so the restore doesn't
                // create a second document alongside the pipeline-written one.
                const autoFixDocId = `${b.id}_w${String(result.week).padStart(2, '0')}`
                await setDoc(doc(db, 'bowlerScores', autoFixDocId), scoreData)
                newScores.push({ bowlerId: b.id!, game1: blindScore, game2: blindScore, game3: blindScore, substituteAvg: null })
              }
              // Combine existing docs with newly synthesized scores
              finalDocs = [
                ...existingDocs.map(d => ({
                  bowlerId: d.bowlerId,
                  game1: d.game1 ?? 0,
                  game2: d.game2 ?? 0,
                  game3: d.game3 ?? 0,
                  substituteAvg: d.isSubstitute ? (d.substituteAvg ?? null) : null,
                })),
                ...newScores,
              ]
            } else {
              // Already exactly 4 — no doc changes needed, just sum for totals
              finalDocs = existingDocs.map(d => ({
                bowlerId: d.bowlerId,
                game1: d.game1 ?? 0,
                game2: d.game2 ?? 0,
                game3: d.game3 ?? 0,
                substituteAvg: d.isSubstitute ? (d.substituteAvg ?? null) : null,
              }))
            }

            return finalDocs
          }

          const t1Final = await fixSide(
            t1All, t1BowlerMap, matchupDetail.team1,
            result.team1Id, result.team2Id, result.team2Name, t1Lane,
          )
          const t2Final = await fixSide(
            t2All, t2BowlerMap, matchupDetail.team2,
            result.team2Id, result.team1Id, result.team1Name, t2Lane,
          )

          // ── Recompute matchupDetail totals ─────────────────────────────────
          // Subs aren't on the team roster, so bowlerMap won't have them — fall back
          // to the average that was manually entered for them (substituteAvg).
          const sumSide = (docs: ScoreTuple[], bowlerMap: Map<string, Bowler>) => ({
            g1: docs.reduce((s, d) => s + d.game1, 0),
            g2: docs.reduce((s, d) => s + d.game2, 0),
            g3: docs.reduce((s, d) => s + d.game3, 0),
            scratch: docs.reduce((s, d) => s + d.game1 + d.game2 + d.game3, 0),
            teamAvg: docs.reduce((s, d) => s + (bowlerMap.get(d.bowlerId)?.enteringAvg ?? d.substituteAvg ?? 0), 0),
            bowlerAverages: docs.map(d => bowlerMap.get(d.bowlerId)?.enteringAvg ?? d.substituteAvg ?? 0),
          })

          const t1IsTeamTotals = !!matchupDetail.team1.individualScoresUnavailable
          const t2IsTeamTotals = !!matchupDetail.team2.individualScoresUnavailable

          const t1 = t1IsTeamTotals
            ? { g1: matchupDetail.team1.game1Total, g2: matchupDetail.team1.game2Total, g3: matchupDetail.team1.game3Total, scratch: matchupDetail.team1.scratchSeries, teamAvg: matchupDetail.team1.teamAvg, bowlerAverages: [] as number[] }
            : sumSide(t1Final, t1BowlerMap)

          const t2 = t2IsTeamTotals
            ? { g1: matchupDetail.team2.game1Total, g2: matchupDetail.team2.game2Total, g3: matchupDetail.team2.game3Total, scratch: matchupDetail.team2.scratchSeries, teamAvg: matchupDetail.team2.teamAvg, bowlerAverages: [] as number[] }
            : sumSide(t2Final, t2BowlerMap)

          const skipHdcp = t1.teamAvg === 0 || t2.teamAvg === 0 || t1IsTeamTotals || t2IsTeamTotals
          const t1Hdcp = t1IsTeamTotals ? 0
            : matchupDetail.team1.handicapOverride
              ?? (skipHdcp ? (matchupDetail.team1.handicapGame1 ?? 0)
                : calculateGameHandicap({ teamAvg: t1.teamAvg, opponentAvg: t2.teamAvg, bowlerAverages: t1.bowlerAverages }, leagueConfig ?? undefined))
          const t2Hdcp = t2IsTeamTotals ? 0
            : matchupDetail.team2.handicapOverride
              ?? (skipHdcp ? (matchupDetail.team2.handicapGame1 ?? 0)
                : calculateGameHandicap({ teamAvg: t2.teamAvg, opponentAvg: t1.teamAvg, bowlerAverages: t2.bowlerAverages }, leagueConfig ?? undefined))

          const t1Total = t1IsTeamTotals ? matchupDetail.team1.totalSeries : t1.scratch + t1Hdcp * 3
          const t2Total = t2IsTeamTotals ? matchupDetail.team2.totalSeries : t2.scratch + t2Hdcp * 3

          const t1Points =
            gPoint(t1.g1 + (t1IsTeamTotals ? 0 : t1Hdcp), t2.g1 + (t2IsTeamTotals ? 0 : t2Hdcp)) +
            gPoint(t1.g2 + (t1IsTeamTotals ? 0 : t1Hdcp), t2.g2 + (t2IsTeamTotals ? 0 : t2Hdcp)) +
            gPoint(t1.g3 + (t1IsTeamTotals ? 0 : t1Hdcp), t2.g3 + (t2IsTeamTotals ? 0 : t2Hdcp)) +
            gPoint(t1Total, t2Total)

          const updatedT1: TeamSummary = t1IsTeamTotals ? matchupDetail.team1 : {
            ...matchupDetail.team1,
            teamAvg: t1.teamAvg, game1Total: t1.g1, game2Total: t1.g2, game3Total: t1.g3,
            scratchSeries: t1.scratch, handicapGame1: t1Hdcp, handicapGame2: t1Hdcp, handicapGame3: t1Hdcp, handicapSeries: t1Hdcp * 3,
            totalSeries: t1Total, points: t1Points, individualScoresUnavailable: false,
          }
          const updatedT2: TeamSummary = t2IsTeamTotals ? matchupDetail.team2 : {
            ...matchupDetail.team2,
            teamAvg: t2.teamAvg, game1Total: t2.g1, game2Total: t2.g2, game3Total: t2.g3,
            scratchSeries: t2.scratch, handicapGame1: t2Hdcp, handicapGame2: t2Hdcp, handicapGame3: t2Hdcp, handicapSeries: t2Hdcp * 3,
            totalSeries: t2Total, points: 4 - t1Points, individualScoresUnavailable: false,
          }

          await updateDoc(doc(db, 'matchupDetails', result.matchupDetailId), {
            team1: updatedT1, team2: updatedT2, adminOverride: true,
          })

          fixed++
        } catch (err) {
          console.error(`[DataCorrectionAdmin] autoFix week ${result.week}:`, err)
          failed++
        }
      }

      await runValidation()
      // Reload the week entries so the compact header dots reflect corrected points.
      if (selectedWeek) await loadWeekMatchups(selectedWeek as number)
      setAutoFixMsg(
        `Auto-fix complete: ${fixed} matchup(s) corrected` +
        (failed > 0 ? `, ${failed} failed — see console.` : '.')
      )
    } finally {
      setAutoFixRunning(false)
    }
  }

  // ── Delete week data ───────────────────────────────────────────────────────

  /**
   * Deletes the matchupDetails record for this entry and any bowlerScore docs
   * belonging to the active team for this week, then reloads the week list.
   * The entry will revert to 'orphan' (if bowlerScores remain) or 'missing'.
   */
  async function handleDeleteData() {
    if (!expandedEntry || !selectedWeek) return
    const teamName = editingSide === 'left' ? leftTeamName : rightTeamName
    const hasBowlerScores = Object.keys(activeExistingDocs).length > 0
    const hasMatchupDoc = !!expandedEntry.matchupDetailDocId

    const what = [
      hasMatchupDoc && 'matchup record',
      hasBowlerScores && `${Object.keys(activeExistingDocs).length} bowler score${Object.keys(activeExistingDocs).length !== 1 ? 's' : ''}`,
    ].filter(Boolean).join(' and ')

    if (!what) {
      setSaveError('Nothing to delete — no saved data found for this entry.')
      return
    }

    if (!window.confirm(`Delete ${what} for ${teamName} — Week ${selectedWeek}? This cannot be undone.`)) return

    setDeletingData(true)
    setSaveError('')
    setSaveMsg('')
    try {
      if (hasMatchupDoc) {
        await deleteDoc(doc(db, 'matchupDetails', expandedEntry.matchupDetailDocId!))
      }
      for (const docId of Object.values(activeExistingDocs)) {
        await deleteDoc(doc(db, 'bowlerScores', docId))
      }
      // Collapse editor and refresh the full week list to reflect correct entry types
      setExpandedEntryId(null)
      resetEditorState()
      await loadWeekMatchups(selectedWeek as number)
    } catch (err) {
      console.error('[DataCorrectionAdmin] handleDeleteData:', err)
      setSaveError('Failed to delete data.')
    } finally {
      setDeletingData(false)
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  /**
   * Renders a read-only totals summary for the inactive panel.
   * Uses matchupDetail data when available; falls back to summing bowlerScores inputs.
   */
  function renderReadOnlyPanel(side: 'left' | 'right') {
    const sideKey = side === 'left' ? 'team1' : 'team2'
    const bowlers = side === 'left' ? leftBowlers : rightBowlers
    const inputs = side === 'left' ? leftScoreInputs : rightScoreInputs

    if (expandedDetail) {
      const s = expandedDetail[sideKey]
      if (!s) return <p className="admin-form-hint">No data for this side.</p>

      // Resolve with-hdcp per-game values for win/loss comparison.
      // individualScoresUnavailable means game totals already include hdcp.
      const oppKey: 'team1' | 'team2' = side === 'left' ? 'team2' : 'team1'
      const opp = expandedDetail[oppKey]
      const myG1 = s.game1Total + (s.individualScoresUnavailable ? 0 : s.handicapGame1)
      const myG2 = s.game2Total + (s.individualScoresUnavailable ? 0 : s.handicapGame2)
      const myG3 = s.game3Total + (s.individualScoresUnavailable ? 0 : s.handicapGame3)
      const oppG1 = opp ? opp.game1Total + (opp.individualScoresUnavailable ? 0 : opp.handicapGame1) : null
      const oppG2 = opp ? opp.game2Total + (opp.individualScoresUnavailable ? 0 : opp.handicapGame2) : null
      const oppG3 = opp ? opp.game3Total + (opp.individualScoresUnavailable ? 0 : opp.handicapGame3) : null
      const oppTotal = opp?.totalSeries ?? null

      /** Returns a CSS class for a final-row cell based on head-to-head comparison. */
      const wl = (mine: number, theirs: number | null) => {
        if (theirs === null) return ''
        if (mine > theirs) return 'dc-game-win'
        if (mine < theirs) return 'dc-game-loss'
        return 'dc-game-tie'
      }

      return (
        <>
          {bowlers.length > 0 && (
            <table className="dc-scores-table">
              <thead><tr>
                <th className="dc-name-col">Bowler</th>
                <th className="dc-avg-col">Avg</th>
                <th className="dc-score-col">G1</th>
                <th className="dc-score-col">G2</th>
                <th className="dc-score-col">G3</th>
                <th className="dc-series-col">
                  Series
                  {s.individualScoresUnavailable && (
                    <span
                      className="dc-na-info"
                      title="Individual scores unavailable — totals were manually entered because this team's data was removed from LeaguePals."
                    > ⓘ</span>
                  )}
                </th>
              </tr></thead>
              <tbody>
                {bowlers.map(b => {
                  if (s.individualScoresUnavailable) {
                    return (
                      <tr key={b.id} className="dc-na-row">
                        <td className="dc-bowler-name">{b.name} ({b.gamesPlayed ?? 0})</td>
                        <td className="dc-avg-cell">{blindBaseAvg(b) || '—'}</td>
                        <td className="dc-na-cell">N/A</td>
                        <td className="dc-na-cell">N/A</td>
                        <td className="dc-na-cell">N/A</td>
                        <td className="dc-na-cell">N/A</td>
                      </tr>
                    )
                  }
                  const inp = inputs[b.id!]
                  const blindAvg = weeklyAvg(b, inp)
                  const bv  = blindAvg > 0 ? blindAvg - Math.floor(blindAvg * BLIND_PENALTY_PCT) : 0
                  const g1 = inp?.blind1 ? bv : (parseInt(inp?.g1 ?? '') || 0)
                  const g2 = inp?.blind2 ? bv : (parseInt(inp?.g2 ?? '') || 0)
                  const g3 = inp?.blind3 ? bv : (parseInt(inp?.g3 ?? '') || 0)
                  const anyBlind = inp?.blind1 || inp?.blind2 || inp?.blind3
                  // No current-season avg → derive from actual week games (new bowler rule)
                  const displayAvg = blindAvg > 0 ? blindAvg
                    : anyBlind ? 0
                    : Math.floor((g1 + g2 + g3) / 3)
                  const cell = (v: number, blind: boolean) =>
                    v > 0
                      ? <span className={blind ? 'dc-blind-score-display dc-blind-score-inline' : ''}>{v}</span>
                      : <span className="dc-empty">—</span>
                  return (
                    <tr key={b.id} className={anyBlind ? 'dc-blinded-row' : ''}>
                      <td className="dc-bowler-name">{b.name} ({b.gamesPlayed ?? 0})</td>
                      <td className="dc-avg-cell">{displayAvg || '—'}</td>
                      <td>{cell(g1, !!inp?.blind1)}</td>
                      <td>{cell(g2, !!inp?.blind2)}</td>
                      <td>{cell(g3, !!inp?.blind3)}</td>
                      <td className="dc-series-cell">{g1 + g2 + g3 > 0 ? g1 + g2 + g3 : <span className="dc-empty">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <table className="dc-scores-table dc-team-totals-preview">
            <thead><tr>
              <th className="dc-name-col"></th>
              <th className="dc-avg-col">Avg</th>
              <th className="dc-score-col">G1</th>
              <th className="dc-score-col">G2</th>
              <th className="dc-score-col">G3</th>
              <th className="dc-series-col">Series</th>
            </tr></thead>
            <tfoot>
              <tr className="dc-totals-avg">
                <td>Team Avg</td>
                <td className="dc-avg-cell dc-team-avg-value">{s.teamAvg || '—'}</td>
                <td></td><td></td><td></td><td></td>
              </tr>
              {s.individualScoresUnavailable ? (
                <tr className="dc-totals-final">
                  <td>Total w/ Hdcp</td>
                  <td></td>
                  <td className={wl(myG1, oppG1)}>{s.game1Total}</td>
                  <td className={wl(myG2, oppG2)}>{s.game2Total}</td>
                  <td className={wl(myG3, oppG3)}>{s.game3Total}</td>
                  <td className={wl(s.totalSeries, oppTotal)}>{s.totalSeries}</td>
                </tr>
              ) : (
                <>
                  <tr className="dc-totals-scratch">
                    <td>Scratch</td>
                    <td></td>
                    <td>{s.game1Total}</td><td>{s.game2Total}</td><td>{s.game3Total}</td>
                    <td>{s.scratchSeries}</td>
                  </tr>
                  <tr className="dc-totals-handicap">
                    <td>Handicap{s.handicapOverride != null ? ' (Pinned)' : ''}</td>
                    <td></td>
                    <td>{s.handicapGame1}</td><td>{s.handicapGame2}</td><td>{s.handicapGame3}</td>
                    <td>{s.handicapSeries}</td>
                  </tr>
                  <tr className="dc-totals-final">
                    <td>Total</td>
                    <td></td>
                    <td className={wl(myG1, oppG1)}>{s.game1Total + s.handicapGame1}</td>
                    <td className={wl(myG2, oppG2)}>{s.game2Total + s.handicapGame2}</td>
                    <td className={wl(myG3, oppG3)}>{s.game3Total + s.handicapGame3}</td>
                    <td className={wl(s.totalSeries, oppTotal)}>{s.totalSeries}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </>
      )
    }

    // No matchupDetail — sum from bowlerScore inputs
    let g1 = 0, g2 = 0, g3 = 0
    for (const b of bowlers) {
      const inp = inputs[b.id!]
      g1 += parseInt(inp?.g1 ?? '') || 0
      g2 += parseInt(inp?.g2 ?? '') || 0
      g3 += parseInt(inp?.g3 ?? '') || 0
    }
    if (g1 === 0 && g2 === 0 && g3 === 0) {
      return <p className="admin-form-hint">No scores on file for this team this week.</p>
    }
    return (
      <table className="dc-scores-table dc-team-totals-preview">
        <thead><tr>
          <th className="dc-name-col"></th>
          <th className="dc-score-col">G1</th>
          <th className="dc-score-col">G2</th>
          <th className="dc-score-col">G3</th>
          <th className="dc-series-col">Series</th>
        </tr></thead>
        <tfoot>
          <tr className="dc-totals-scratch">
            <td>Scratch (from bowler scores)</td>
            <td>{g1}</td><td>{g2}</td><td>{g3}</td><td>{g1 + g2 + g3}</td>
          </tr>
        </tfoot>
      </table>
    )
  }

  /**
   * Renders a placeholder panel for a Vacant opponent that has no stored matchupDetail yet.
   * Shows the live formula score so the admin can see what will be written on save.
   */
  function renderVacantPanel() {
    return (
      <div className="dc-vacant-panel">
        <p className="dc-vacant-label">Vacant Team</p>
        {liveVacantScore != null ? (
          <p className="dc-vacant-score-preview">
            Auto score (90% of opponent avg): <strong>{liveVacantScore}</strong> per game
            <br />
            <span className="admin-form-hint">Will be calculated and saved when you save the active team&apos;s scores.</span>
          </p>
        ) : (
          <p className="admin-form-hint">Enter the opposing team&apos;s scores to preview the Vacant score.</p>
        )}
      </div>
    )
  }

  /** Renders the active edit form (individual or team totals). */
  function renderEditForm(side: 'left' | 'right') {
    const bowlers = side === 'left' ? leftBowlers : rightBowlers
    const scoreInputs = side === 'left' ? leftScoreInputs : rightScoreInputs
    const setScoreInputs = side === 'left' ? setLeftScoreInputs : setRightScoreInputs
    const excluded = side === 'left' ? leftExcluded : rightExcluded
    const setExcluded = side === 'left' ? setLeftExcluded : setRightExcluded
    const subRowIds = side === 'left' ? leftSubRowIds : rightSubRowIds
    const sideKey = side === 'left' ? 'team1' : 'team2'
    const hasMatchupDetail = !!expandedDetail


    return (
      <>
        {/* Mode toggle */}
        <div className="dc-mode-toggle">
          <button
            type="button"
            className={`dc-mode-btn${scoreEntryMode === 'individual' ? ' dc-mode-btn--active' : ''}`}
            onClick={() => { setScoreEntryMode('individual'); setSaveMsg(''); setSaveError('') }}
          >
            Individual Scores
          </button>
          <button
            type="button"
            className={`dc-mode-btn${scoreEntryMode === 'teamTotals' ? ' dc-mode-btn--active' : ''}`}
            onClick={() => {
              setScoreEntryMode('teamTotals')
              setSaveMsg('')
              setSaveError('')
              const s = expandedDetail?.[sideKey]
              if (s) {
                // When data was saved via individual mode, game1Total/2/3 are scratch.
                // Add each game's own handicap so the form shows the correct with-hdcp
                // values. When already saved via team totals (individualScoresUnavailable),
                // the values are already with-hdcp and handicap is 0 — no-op.
                const skip = s.individualScoresUnavailable
                setTeamTotalsInputs({
                  g1: String(s.game1Total + (skip ? 0 : (s.handicapGame1 ?? 0))),
                  g2: String(s.game2Total + (skip ? 0 : (s.handicapGame2 ?? 0))),
                  g3: String(s.game3Total + (skip ? 0 : (s.handicapGame3 ?? 0))),
                  points: String(s.points),
                })
              }
            }}
          >
            Team Totals Only
          </button>
        </div>

        {scoreEntryMode === 'individual' ? (
          <>
            {!hasMatchupDetail && (
              <p className="admin-form-hint dc-no-matchup-note">
                No matchup record — bowler scores saved, but scorecard won't show
                until you also save via <strong>Team Totals Only</strong>.
              </p>
            )}
            {hasMatchupDetail && (
              <div className="dc-handicap-pin-control">
                <label htmlFor={`dc-handicap-pin-${side}`}>Handicap / Game</label>
                <input
                  id={`dc-handicap-pin-${side}`}
                  className="admin-input dc-handicap-pin-input"
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  value={activeHandicapOverrideInput}
                  placeholder={liveTotals ? `Auto (${liveTotals.autoHdcp})` : 'Auto'}
                  disabled={isOpponentVacant}
                  onChange={e => setHandicapOverrideInputs(prev => ({
                    ...prev,
                    [activeTeamId]: e.target.value,
                  }))}
                />
                <span className={`dc-handicap-pin-status${activeHandicapOverride != null ? ' dc-handicap-pin-status--pinned' : ''}`}>
                  {isOpponentVacant
                    ? 'Vacant matchup: no handicap'
                    : activeHandicapOverride != null
                    ? `Pinned at ${activeHandicapOverride}`
                    : 'Auto calculated'}
                </span>
                {activeHandicapOverride != null && (
                  <button
                    type="button"
                    className="admin-btn-secondary dc-handicap-unpin-btn"
                    onClick={() => setHandicapOverrideInputs(prev => ({ ...prev, [activeTeamId]: '' }))}
                  >
                    Use Auto
                  </button>
                )}
              </div>
            )}
            {bowlers.length === 0 ? (
              <p className="admin-form-hint">No bowlers on roster. Add them in Edit Teams.</p>
            ) : (
              <table className="dc-scores-table dc-scores-table--edit">
                <thead><tr>
                  <th className="dc-avg-col">Avg</th>
                  <th className="dc-score-col">G1</th>
                  <th className="dc-score-col">G2</th>
                  <th className="dc-score-col">G3</th>
                  <th className="dc-series-col">Series</th>
                  <th className="dc-blind-col" title="Mark Game 1 as blind (avg − 10%)">B1</th>
                  <th className="dc-blind-col" title="Mark Game 2 as blind (avg − 10%)">B2</th>
                  <th className="dc-blind-col" title="Mark Game 3 as blind (avg − 10%)">B3</th>
                </tr></thead>
                <tbody>
                  {bowlers.map(b => {
                    const empty: ScoreInput = { avg: '', g1: '', g2: '', g3: '', blind1: false, blind2: false, blind3: false }
                    const s = scoreInputs[b.id!] ?? empty
                    const blindAvg = weeklyAvg(b, s)
                    const bv  = blindAvg > 0 ? blindAvg - Math.floor(blindAvg * BLIND_PENALTY_PCT) : 0
                    const g1 = s.blind1 ? bv : (parseInt(s.g1) || 0)
                    const g2 = s.blind2 ? bv : (parseInt(s.g2) || 0)
                    const g3 = s.blind3 ? bv : (parseInt(s.g3) || 0)
                    const anyBlind = s.blind1 || s.blind2 || s.blind3
                    const isExcluded = excluded.has(b.id!)
                    const isSubRow = subRowIds.has(b.id!)

                    const toggleBlind = (flag: 'blind1' | 'blind2' | 'blind3') =>
                      (e: React.ChangeEvent<HTMLInputElement>) =>
                        setScoreInputs(prev => ({ ...prev, [b.id!]: { ...(prev[b.id!] ?? empty), [flag]: e.target.checked } }))

                    const blindTitle = (game: number) =>
                      `Blind: ${blindAvg} avg − ${Math.floor(blindAvg * BLIND_PENALTY_PCT)} penalty = ${bv}` +
                      (game === 1 && s.g1 !== '' && !s.blind1 ? ' (clear G1 first)' :
                       game === 2 && s.g2 !== '' && !s.blind2 ? ' (clear G2 first)' :
                       game === 3 && s.g3 !== '' && !s.blind3 ? ' (clear G3 first)' : '')

                    const toggleExcluded = () => {
                      if (!isExcluded) {
                        setScoreInputs(inputs => ({
                          ...inputs,
                          [b.id!]: {
                            ...(inputs[b.id!] ?? empty),
                            blind1: false,
                            blind2: false,
                            blind3: false,
                          },
                        }))
                      }
                      setExcluded(prev => {
                        const next = new Set(prev)
                        if (next.has(b.id!)) next.delete(b.id!)
                        else next.add(b.id!)
                        return next
                      })
                    }

                    return (
                      <Fragment key={b.id}>
                        <tr className={`dc-bowler-name-row${anyBlind && !isExcluded ? ' dc-blinded-name-row' : ''}${isExcluded ? ' dc-excluded-name-row' : ''}`}>
                          <td colSpan={8}>
                            <div className="dc-bowler-name-flex">
                              <span className="dc-bowler-name-inner">
                                {b.name} ({b.gamesPlayed ?? 0})
                                {isSubRow
                                  ? <span className="dc-blind-name-badge">sub, avg {b.average}</span>
                                  : isExcluded
                                  ? <span className="dc-excluded-badge">not in lineup</span>
                                  : anyBlind && <span className="dc-blind-name-badge">blind</span>}
                              </span>
                              {isSubRow ? (
                                <button
                                  type="button"
                                  className="dc-exclude-btn"
                                  onClick={() => handleRemoveSubRow(b.id!)}
                                  title="Remove this substitute from the lineup"
                                >
                                  ✗ Remove Sub
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={`dc-exclude-btn${isExcluded ? ' dc-exclude-btn--restore' : ''}`}
                                  onClick={toggleExcluded}
                                  title={isExcluded ? 'Add to this week\'s lineup' : 'Remove from this week\'s lineup (won\'t count toward scratch)'}
                                >
                                  {isExcluded ? '+ Add to Lineup' : '✗ Remove'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        <tr className={`dc-bowler-data-row${anyBlind && !isExcluded ? ' dc-blinded-row' : ''}${isExcluded ? ' dc-excluded-row' : ''}`}>
                          <td className="dc-avg-cell">
                            <input
                              className="admin-input dc-weekly-avg-input"
                              type="number"
                              min={0}
                              max={300}
                              step={1}
                              value={s.avg}
                              placeholder={String(blindBaseAvg(b) || '—')}
                              aria-label={`${b.name} average used for week ${selectedWeek}`}
                              title="Average used for this week's blind score, team average, and handicap. Clear to use the calculated entering average."
                              disabled={isExcluded}
                              onChange={e => setScoreInputs(prev => ({
                                ...prev,
                                [b.id!]: { ...(prev[b.id!] ?? empty), avg: e.target.value },
                              }))}
                            />
                          </td>
                          <td>
                            {s.blind1
                              ? <span className="dc-blind-score-display">{bv || '—'}</span>
                              : <input className="admin-input dc-score-input" type="number" min={0} max={300}
                                  value={s.g1} placeholder="—"
                                  onChange={e => setScoreInputs(prev => ({ ...prev, [b.id!]: { ...(prev[b.id!] ?? empty), g1: e.target.value } }))} />}
                          </td>
                          <td>
                            {s.blind2
                              ? <span className="dc-blind-score-display">{bv || '—'}</span>
                              : <input className="admin-input dc-score-input" type="number" min={0} max={300}
                                  value={s.g2} placeholder="—"
                                  onChange={e => setScoreInputs(prev => ({ ...prev, [b.id!]: { ...(prev[b.id!] ?? empty), g2: e.target.value } }))} />}
                          </td>
                          <td>
                            {s.blind3
                              ? <span className="dc-blind-score-display">{bv || '—'}</span>
                              : <input className="admin-input dc-score-input" type="number" min={0} max={300}
                                  value={s.g3} placeholder="—"
                                  onChange={e => setScoreInputs(prev => ({ ...prev, [b.id!]: { ...(prev[b.id!] ?? empty), g3: e.target.value } }))} />}
                          </td>
                          <td className="dc-series-cell">
                            {g1 + g2 + g3 > 0 ? g1 + g2 + g3 : <span className="dc-empty">—</span>}
                          </td>
                          <td className="dc-blind-cell">
                            <input type="checkbox" className="dc-blind-checkbox"
                              checked={s.blind1}
                              disabled={!s.blind1 && s.g1 !== ''}
                              title={blindTitle(1)}
                              onChange={toggleBlind('blind1')} />
                          </td>
                          <td className="dc-blind-cell">
                            <input type="checkbox" className="dc-blind-checkbox"
                              checked={s.blind2}
                              disabled={!s.blind2 && s.g2 !== ''}
                              title={blindTitle(2)}
                              onChange={toggleBlind('blind2')} />
                          </td>
                          <td className="dc-blind-cell">
                            <input type="checkbox" className="dc-blind-checkbox"
                              checked={s.blind3}
                              disabled={!s.blind3 && s.g3 !== ''}
                              title={blindTitle(3)}
                              onChange={toggleBlind('blind3')} />
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
                {liveTotals && (
                  <tfoot>
                    <tr className="dc-totals-avg">
                      <td className="dc-totals-avg-label">Team Avg</td>
                      <td colSpan={7} className="dc-team-avg-value">{liveTotals.teamAvg || '—'}</td>
                    </tr>
                    <tr className="dc-totals-scratch">
                      <td>
                        Scratch
                        <span className={`dc-bowler-count${liveTotals.count === 4 ? ' dc-bowler-count--ok' : ' dc-bowler-count--warn'}`}>
                          {liveTotals.count}/4
                        </span>
                      </td>
                      <td>{liveTotals.g1}</td><td>{liveTotals.g2}</td><td>{liveTotals.g3}</td>
                      <td colSpan={4}>{liveTotals.scratch}</td>
                    </tr>
                    <tr className="dc-totals-handicap">
                      <td>Handicap{liveTotals.handicapPinned ? ' (Pinned)' : ''}</td>
                      <td>{liveTotals.hdcp}</td><td>{liveTotals.hdcp}</td><td>{liveTotals.hdcp}</td>
                      <td colSpan={4}>{liveTotals.hdcpSeries}</td>
                    </tr>
                    <tr className="dc-totals-final">
                      <td>Total</td>
                      <td>{liveTotals.g1 + liveTotals.hdcp}</td>
                      <td>{liveTotals.g2 + liveTotals.hdcp}</td>
                      <td>{liveTotals.g3 + liveTotals.hdcp}</td>
                      <td colSpan={4}>{liveTotals.total}</td>
                    </tr>
                    {autoPoints != null && (
                      <tr className="dc-totals-points">
                        <td>Points Won</td>
                        <td colSpan={7} className="dc-auto-points">{autoPoints}</td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            )}
            {showAddSubForm ? (
              <div className="dc-add-bowler-form">
                <select className="admin-input dc-roster-input" value={addSubForm.subId} autoFocus
                  onChange={e => setAddSubForm(f => ({
                    ...f, subId: e.target.value, firstName: '', lastName: '', enteringAvg: '', weeklyAvg: '',
                  }))}>
                  <option value="">+ New substitute…</option>
                  {subPool.map(sb => (
                    <option key={sb.id} value={sb.id}>{sb.name}</option>
                  ))}
                </select>
                {!addSubForm.subId && (
                  <>
                    <input className="admin-input dc-roster-input" placeholder="First Name"
                      value={addSubForm.firstName}
                      onChange={e => setAddSubForm(f => ({ ...f, firstName: e.target.value }))} />
                    <input className="admin-input dc-roster-input" placeholder="Last Name"
                      value={addSubForm.lastName}
                      onChange={e => setAddSubForm(f => ({ ...f, lastName: e.target.value }))} />
                  </>
                )}
                <div className="dc-add-sub-avgs">
                  {!addSubForm.subId && (
                    <input className="admin-input dc-avg-input" type="number" min={0} max={300}
                      placeholder="Entering Avg" value={addSubForm.enteringAvg}
                      onChange={e => setAddSubForm(f => ({ ...f, enteringAvg: e.target.value }))} />
                  )}
                  <input className="admin-input dc-avg-input" type="number" min={0} max={300}
                    placeholder="Avg This Week" value={addSubForm.weeklyAvg}
                    onChange={e => setAddSubForm(f => ({ ...f, weeklyAvg: e.target.value }))} />
                </div>
                <button className="admin-btn-primary dc-add-confirm-btn"
                  onClick={handleAddSub} disabled={savingSub}>
                  {savingSub ? 'Adding…' : 'Add Sub'}
                </button>
                <button className="admin-btn-secondary"
                  onClick={() => { setShowAddSubForm(false); setSaveError('') }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="admin-btn-secondary dc-add-bowler-btn"
                onClick={() => {
                  setShowAddSubForm(true)
                  setAddSubForm({ subId: '', firstName: '', lastName: '', enteringAvg: '', weeklyAvg: '' })
                  loadSubPool()
                }}>
                + Add Sub
              </button>
            )}
            <div className="dc-scores-actions">
              <button className="admin-btn-primary" onClick={handleSaveScores}
                disabled={savingScores || !liveTotals}>
                {savingScores ? 'Saving…' : 'Save Scores'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="admin-form-hint dc-team-totals-hint">
              Enter the final game totals with handicap already included.
              Series is calculated automatically. Individual scores will show as <strong className="dc-asterisk-label">*</strong> in public views.
            </p>
            <div className="dc-team-totals-grid">
              {(['g1', 'g2', 'g3'] as const).map((g, i) => (
                <div key={g} className="dc-team-totals-field">
                  <label className="admin-label">G{i + 1} (w/ Hdcp)</label>
                  <input className="admin-input dc-score-input" type="number" min={0} max={1200} placeholder="—"
                    value={teamTotalsInputs[g]}
                    onChange={e => setTeamTotalsInputs(f => ({ ...f, [g]: e.target.value }))} />
                </div>
              ))}
              {autoPoints == null && (
                <div className="dc-team-totals-field">
                  <label className="admin-label">Points Won</label>
                  <input className="admin-input dc-score-input" type="number" min={0} max={4} step={0.5} placeholder="0"
                    value={teamTotalsInputs.points}
                    onChange={e => setTeamTotalsInputs(f => ({ ...f, points: e.target.value }))} />
                </div>
              )}
            </div>
            {liveTeamTotals && (
              <table className="dc-scores-table dc-team-totals-preview">
                <thead><tr>
                  <th className="dc-name-col"></th>
                  <th className="dc-score-col">G1</th>
                  <th className="dc-score-col">G2</th>
                  <th className="dc-score-col">G3</th>
                  <th className="dc-series-col">Series</th>
                </tr></thead>
                <tfoot>
                  <tr className="dc-totals-final">
                    <td>Total w/ Hdcp</td>
                    <td>{liveTeamTotals.g1}</td>
                    <td>{liveTeamTotals.g2}</td>
                    <td>{liveTeamTotals.g3}</td>
                    <td>{liveTeamTotals.total}</td>
                  </tr>
                  {autoPoints != null && (
                    <tr className="dc-totals-points">
                      <td>Points Won</td>
                      <td colSpan={4} className="dc-auto-points">{autoPoints}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            )}
            <div className="dc-scores-actions">
              <button className="admin-btn-primary" onClick={handleSaveTeamTotals}
                disabled={savingTeamTotals || !liveTeamTotals}>
                {savingTeamTotals ? 'Saving…' : 'Save Team Totals'}
              </button>
            </div>
          </>
        )}
      </>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h1 className="admin-panel-title">Data Correction</h1>
      </div>

      {/* Top-level mode tabs */}
      <div className="dc-top-tabs">
        <button type="button"
          className={`dc-top-tab${mode === 'teams' ? ' dc-top-tab--active' : ''}`}
          onClick={() => setMode('teams')}>
          Edit Teams
        </button>
        <button type="button"
          className={`dc-top-tab${mode === 'scores' ? ' dc-top-tab--active' : ''}`}
          onClick={() => setMode('scores')}>
          Edit Scores
        </button>
        <button type="button"
          className={`dc-top-tab${mode === 'validate' ? ' dc-top-tab--active' : ''}`}
          onClick={() => setMode('validate')}>
          Validate Matchups
        </button>
      </div>

      {/* ═══════════ EDIT TEAMS ═══════════ */}
      {mode === 'teams' && (
        <div className="dc-teams-mode">
          <p className="dc-intro admin-form-hint">
            Manage team rosters and entering averages. All changes are protected from automated data refreshes.
          </p>

          {rosterMsg && <p className="admin-success-msg">{rosterMsg}</p>}
          {rosterError && <p className="admin-error-msg">{rosterError}</p>}

          <div className="dc-team-list">
            {teamsSortedById.map(team => {
              const isExpanded = expandedTeamId === team.id
              const rows = rosterCache[team.id!] ?? []
              const isLoading = loadingBowlersFor === team.id

              return (
                <div key={team.id} className={`dc-team-row${isExpanded ? ' dc-team-row--expanded' : ''}`}>
                  <button type="button" className="dc-team-toggle" onClick={() => handleToggleTeam(team.id!)}>
                    <span className="dc-team-num">{team.displayId}</span>
                    <span className="dc-team-name-label">{team.name}</span>
                    <span className="dc-team-bowler-count">
                      {bowlersCache[team.id!] ? `${bowlersCache[team.id!].length} bowler${bowlersCache[team.id!].length !== 1 ? 's' : ''}` : ''}
                    </span>
                    <span className="dc-team-chevron">{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {isExpanded && (
                    <div className="dc-team-detail">
                      {isLoading ? (
                        <p className="admin-loading">Loading roster…</p>
                      ) : (
                        <>
                          {rows.length > 0 && (
                            <table className="dc-roster-table">
                              <thead><tr>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Entering Avg</th>
                                <th className="dc-actions-col">Actions</th>
                              </tr></thead>
                              <tbody>
                                {rows.map(row => (
                                  <tr key={row.id}>
                                    <td><input className="admin-input dc-roster-input" value={row.firstName}
                                      onChange={e => updateRosterRow(team.id!, row.id, 'firstName', e.target.value)} /></td>
                                    <td><input className="admin-input dc-roster-input" value={row.lastName}
                                      onChange={e => updateRosterRow(team.id!, row.id, 'lastName', e.target.value)} /></td>
                                    <td><input className="admin-input dc-avg-input" type="number" min={0} max={300}
                                      value={row.enteringAvg}
                                      onChange={e => updateRosterRow(team.id!, row.id, 'enteringAvg', e.target.value)} /></td>
                                    <td className="dc-row-actions">
                                      <button className="admin-btn-edit dc-save-btn"
                                        onClick={() => handleSaveBowler(team.id!, row)} disabled={row.saving}>
                                        {row.saving ? '…' : 'Save'}
                                      </button>
                                      <button className="admin-btn-danger"
                                        onClick={() => handleDeleteBowler(team.id!, row.id, `${row.firstName} ${row.lastName}`)}>
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {rows.length === 0 && addBowlerTeamId !== team.id && (
                            <p className="admin-form-hint dc-empty-hint">No bowlers on roster yet.</p>
                          )}
                          {addBowlerTeamId === team.id ? (
                            <div className="dc-add-bowler-form">
                              <input className="admin-input dc-roster-input" placeholder="First Name"
                                value={addBowlerForm.firstName} autoFocus
                                onChange={e => setAddBowlerForm(f => ({ ...f, firstName: e.target.value }))} />
                              <input className="admin-input dc-roster-input" placeholder="Last Name"
                                value={addBowlerForm.lastName}
                                onChange={e => setAddBowlerForm(f => ({ ...f, lastName: e.target.value }))} />
                              <input className="admin-input dc-avg-input" type="number" min={0} max={300}
                                placeholder="Avg" value={addBowlerForm.enteringAvg}
                                onChange={e => setAddBowlerForm(f => ({ ...f, enteringAvg: e.target.value }))} />
                              <button className="admin-btn-primary dc-add-confirm-btn"
                                onClick={() => handleAddBowler(team.id!)} disabled={savingNewBowler}>
                                {savingNewBowler ? 'Adding…' : 'Add Bowler'}
                              </button>
                              <button className="admin-btn-secondary"
                                onClick={() => { setAddBowlerTeamId(null); setRosterError('') }}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button className="admin-btn-secondary dc-add-bowler-btn"
                              onClick={() => {
                                setAddBowlerTeamId(team.id!)
                                setAddBowlerForm({ firstName: '', lastName: '', enteringAvg: '' })
                              }}>
                              + Add Bowler
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Create missing team */}
          <div className="admin-form-card dc-section">
            <h2 className="admin-form-section-title">Create Missing Team</h2>
            {creatingTeam ? (
              <div className="dc-add-bowler-form">
                <div className="dc-create-team-field">
                  <label className="admin-label">Team Number</label>
                  <input className="admin-input dc-team-num-input" type="number" min={1} placeholder="e.g. 15"
                    value={creatingTeam.displayId} autoFocus
                    onChange={e => setCreatingTeam(f => f ? { ...f, displayId: e.target.value } : f)} />
                </div>
                <div className="dc-create-team-field">
                  <label className="admin-label">Team Name</label>
                  <input className="admin-input dc-roster-input" placeholder="e.g. St Hugh's"
                    value={creatingTeam.name}
                    onChange={e => setCreatingTeam(f => f ? { ...f, name: e.target.value } : f)} />
                </div>
                <div className="dc-create-team-field">
                  <label className="admin-label">Captain (optional)</label>
                  <input className="admin-input dc-roster-input" placeholder="Captain name"
                    value={creatingTeam.captainName}
                    onChange={e => setCreatingTeam(f => f ? { ...f, captainName: e.target.value } : f)} />
                </div>
                <div className="dc-create-team-btns">
                  <button className="admin-btn-primary dc-add-confirm-btn"
                    onClick={handleCreateTeam} disabled={savingTeam}>
                    {savingTeam ? 'Creating…' : 'Create Team'}
                  </button>
                  <button className="admin-btn-secondary"
                    onClick={() => { setCreatingTeam(null); setTeamError('') }}>
                    Cancel
                  </button>
                </div>
                {teamError && <p className="admin-error-msg dc-inline-msg">{teamError}</p>}
              </div>
            ) : (
              <button className="admin-btn-secondary dc-create-team-btn"
                onClick={() => setCreatingTeam({ displayId: '', name: '', captainName: '' })}>
                + Create Missing Team
              </button>
            )}
            {teamMsg && !creatingTeam && <p className="admin-success-msg dc-inline-msg">{teamMsg}</p>}
          </div>
        </div>
      )}

      {/* ═══════════ EDIT SCORES ═══════════ */}
      {mode === 'scores' && (
        <div className="dc-scores-mode">
          <div className="admin-form-card dc-selectors-card">
            <div className="dc-selector-row">
              <div className="dc-selector-group">
                <label htmlFor="dc-week-select" className="admin-label">Select Week</label>
                <select id="dc-week-select" className="admin-input dc-week-select"
                  value={selectedWeek}
                  onChange={e => setSelectedWeek(Number(e.target.value) || '')}>
                  <option value="">— Choose a week to see all matchups —</option>
                  {completedWeeks.map(w => (
                    <option key={w.week} value={w.week!}>Week {w.week} — {w.date}</option>
                  ))}
                </select>
              </div>

              <div className="dc-reingest-panel">
                <button
                  type="button"
                  className="admin-btn-secondary dc-reingest-btn"
                  onClick={handleReingestWeek}
                  disabled={!selectedWeek || loadingWeek || reingestingWeek}
                >
                  {reingestingWeek ? 'Re-ingesting…' : 'Re-ingest data'}
                </button>
              </div>
            </div>

            {(reingestStatus || reingestReport) && (
              <div
                className={`dc-reingest-report${reingestReport?.overrideSummary.count ? ' dc-reingest-report--warn' : ''}${reingestingWeek ? ' dc-reingest-report--active' : ''}`}
                role="status"
                aria-live="polite"
              >
                {reingestStatus && <p className="dc-reingest-status">{reingestStatus}</p>}
                {reingestReport && (
                  <>
                    <p>
                      {reingestReport.overrideSummary.count > 0
                        ? `${reingestReport.overrideSummary.count} manual edit(s) ${reingestReport.dryRun ? 'would be' : 'were'} replaced.`
                        : 'No manual edits found for this week.'}
                    </p>
                    <p>
                      Fresh LeaguePals data: {reingestReport.generated.matchupDetails} matchup detail(s), {reingestReport.generated.bowlerScores} bowler score(s).
                    </p>
                    {reingestReport.overrideSummary.count > 0 && (
                      <ul>
                        {[...reingestReport.overrideSummary.matchupDetails, ...reingestReport.overrideSummary.bowlerScores]
                          .slice(0, 6)
                          .map(item => <li key={`${item.collection}-${item.docId}`}>{item.label}</li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {selectedWeek !== '' && (
            <div className="dc-week-matchups">
              {loadingWeek ? (
                <p className="admin-loading">Loading week {selectedWeek} matchups…</p>
              ) : weekEntries.length === 0 ? (
                <p className="admin-form-hint">No matchup data found for week {selectedWeek}.</p>
              ) : (
                sortedWeekEntries.map(entry => {
                  const isExpanded = expandedEntryId === entry.id
                  const d = entry.matchupDetail

                  // Normalize to the odd lane of the pair (mirrors formatLanePair used elsewhere)
                  const rawLane = Number(d?.team1?.lane ?? 0)
                  const oddLane = rawLane % 2 === 1 ? rawLane : rawLane - 1

                  // G1/G2/G3/series win-loss from team1's perspective.
                  // Per-game comparison must add each game's own handicap so that teams
                  // with a positive handicap are compared on equal footing.
                  // Series comparison uses totalSeries which already includes handicap.
                  const gameResults: Array<'win' | 'loss' | 'tie'> | null = d ? (() => {
                    const cmp = (a: number, b: number): 'win' | 'loss' | 'tie' => a > b ? 'win' : a < b ? 'loss' : 'tie'
                    return [
                      cmp(d.team1.game1Total + (d.team1.handicapGame1 ?? 0), d.team2.game1Total + (d.team2.handicapGame1 ?? 0)),
                      cmp(d.team1.game2Total + (d.team1.handicapGame2 ?? 0), d.team2.game2Total + (d.team2.handicapGame2 ?? 0)),
                      cmp(d.team1.game3Total + (d.team1.handicapGame3 ?? 0), d.team2.game3Total + (d.team2.handicapGame3 ?? 0)),
                      cmp(d.team1.totalSeries,       d.team2.totalSeries),
                    ]
                  })() : null

                  return (
                    <div key={entry.id}
                      className={`dc-entry${isExpanded ? ' dc-entry--expanded' : ''}${entry.type === 'orphan' ? ' dc-entry--orphan' : ''}${entry.type === 'missing' ? ' dc-entry--missing' : ''}`}>

                      {/* ── Summary row ── */}
                      <button type="button" className="dc-entry-header"
                        onClick={() => handleExpandEntry(entry.id)}>
                        {entry.type === 'orphan' ? (
                          <>
                            <span className="dc-orphan-badge">⚠ Missing Matchup</span>
                            <span className="dc-entry-teams">{entry.orphanTeam?.displayId} — {entry.orphanTeam?.name}</span>
                            <span className="dc-entry-meta">{entry.orphanBowlerScores.length} bowler score{entry.orphanBowlerScores.length !== 1 ? 's' : ''} on file, no matchup record</span>
                          </>
                        ) : entry.type === 'missing' ? (
                          <>
                            <span className="dc-missing-badge">✕ No Data</span>
                            <span className="dc-entry-teams">{entry.orphanTeam?.displayId} — {entry.orphanTeam?.name}</span>
                            <span className="dc-entry-meta">No scores or matchup record for this week</span>
                          </>
                        ) : (
                          <>
                            <span className="dc-entry-matchup">
                              <span className="dc-entry-team">{d?.team1?.teamName ?? '?'}</span>
                              <span className="dc-entry-dots">
                                <span className="dc-entry-pts-num">{d?.team1?.points ?? '—'}</span>
                                {[0, 1, 2, 3].map(i => (
                                  <span key={i}
                                    className={`dc-entry-dot dc-entry-dot--${gameResults ? gameResults[i] : 'none'}`}
                                    title={i < 3 ? `G${i + 1}` : 'Series'} />
                                ))}
                              </span>
                              <span className="dc-entry-totals">
                                <span className="dc-entry-total-score">{d?.team1?.totalSeries ?? '—'}</span>
                                <span className="dc-entry-vs-col">
                                  {oddLane > 0 && (
                                    <span className="dc-entry-lane">Lanes {oddLane}–{oddLane + 1}</span>
                                  )}
                                  <span className="dc-entry-vs">vs</span>
                                </span>
                                <span className="dc-entry-total-score">{d?.team2?.totalSeries ?? '—'}</span>
                              </span>
                              <span className="dc-entry-dots">
                                {[0, 1, 2, 3].map(i => {
                                  const r = gameResults?.[i]
                                  const side = r === 'win' ? 'loss' : r === 'loss' ? 'win' : r ?? 'none'
                                  return <span key={i}
                                    className={`dc-entry-dot dc-entry-dot--${side}`}
                                    title={i < 3 ? `G${i + 1}` : 'Series'} />
                                })}
                                <span className="dc-entry-pts-num">{d?.team2?.points ?? '—'}</span>
                              </span>
                              <span className="dc-entry-team">{d?.team2?.teamName ?? '?'}</span>
                            </span>
                          </>
                        )}
                        <span className="dc-entry-chevron">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {/* ── Inline editor ── */}
                      {isExpanded && (
                        <div className="dc-entry-editor">
                          {loadingExpanded ? (
                            <p className="admin-loading">Loading matchup data…</p>
                          ) : showSummary ? (
                            /* ── Post-save summary view ── */
                            <>
                              <div className="dc-editor-controls dc-summary-controls">
                                <span className="dc-summary-label">Saved</span>
                                <button type="button" className="admin-btn-secondary"
                                  onClick={() => setShowSummary(false)}>
                                  ✎ Edit
                                </button>
                              </div>
                              <div className="dc-matchup-panels">
                                <div className="dc-panel dc-opponent-panel">
                                  <div className="dc-panel-header">
                                    <span className="dc-panel-team-name">{leftTeamName}</span>
                                  </div>
                                  <div className="dc-panel-body">{renderReadOnlyPanel('left')}</div>
                                </div>
                                {(entry.matchupDetail || orphanOpponentId) && (
                                  <div className="dc-panel dc-opponent-panel">
                                    <div className="dc-panel-header">
                                      <span className="dc-panel-team-name">{rightTeamName}</span>
                                    </div>
                                    <div className="dc-panel-body">{renderReadOnlyPanel('right')}</div>
                                  </div>
                                )}
                              </div>
                              {saveMsg && <p className="admin-success-msg">{saveMsg}</p>}
                              <div className="dc-delete-zone">
                                <button type="button" className="admin-btn-danger dc-delete-btn"
                                  onClick={handleDeleteData} disabled={deletingData}>
                                  {deletingData ? 'Deleting…' : '✕ Delete Week Data'}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Opponent selector for orphan and missing entries */}
                              {(entry.type === 'orphan' || entry.type === 'missing') && !orphanOpponentId && (
                                <div className="dc-opponent-selector-row">
                                  <label className="admin-label">Select Opponent</label>
                                  <select className="admin-input dc-opponent-select" value=""
                                    onChange={e => handleOrphanOpponentSelect(e.target.value)}>
                                    <option value="">— Who did {entry.orphanTeam?.name} bowl against? —</option>
                                    {teamsWithoutMatchup.map(t => (
                                      <option key={t.id} value={t.id!}>{t.displayId} — {t.name}</option>
                                    ))}
                                  </select>
                                  <p className="admin-form-hint dc-opponent-hint">
                                    Or save team totals without selecting an opponent — the right panel will show as unknown.
                                  </p>
                                </div>
                              )}

                              {/* Switch side control — only visible when both panels are shown */}
                              {(entry.matchupDetail || orphanOpponentId) && (
                              <div className="dc-editor-controls">
                                <div className="dc-editing-indicator">
                                  Editing: <strong>{editingSide === 'left' ? leftTeamName : rightTeamName}</strong>
                                </div>
                                <div className="dc-lane-field">
                                  <label className="admin-label dc-lane-label">Lane Pair</label>
                                  <select
                                    className="admin-input dc-lane-select"
                                    value={laneInput}
                                    onChange={e => setLaneInput(e.target.value)}
                                  >
                                    <option value="">— Select —</option>
                                    {LANE_PAIRS.map(({ value, label }) => (
                                      <option key={value} value={value} disabled={usedLanes.has(value)}>
                                        {label}{usedLanes.has(value) ? ' (taken)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <button type="button" className="admin-btn-secondary dc-switch-btn"
                                  onClick={handleSwitchSide}>
                                  ⇄ Switch to {editingSide === 'left' ? rightTeamName : leftTeamName}
                                </button>
                                {entry.matchupDetailDocId && (
                                  <button type="button" className="admin-btn-secondary dc-swap-lanes-btn"
                                    onClick={handleSwapLanes} disabled={swappingLanes}>
                                    {swappingLanes ? 'Swapping…' : '⇅ Swap Lanes'}
                                  </button>
                                )}
                              </div>
                              )}

                              {/* Two-panel layout */}
                              <div className="dc-matchup-panels">
                                {/* Left panel */}
                                <div className={`dc-panel${editingSide === 'left' ? ' dc-primary-panel' : ' dc-opponent-panel'}`}>
                                  <div className="dc-panel-header">
                                    <span className="dc-panel-team-name">{leftTeamName}</span>
                                    {isLeftVacant
                                      ? <span className="dc-vacant-badge">VACANT</span>
                                      : editingSide === 'left'
                                        ? <span className="dc-editing-badge">EDITING</span>
                                        : <span className="dc-readonly-badge">READ-ONLY</span>}
                                  </div>
                                  <div className="dc-panel-body">
                                    {isLeftVacant && !expandedDetail
                                      ? renderVacantPanel()
                                      : editingSide === 'left'
                                        ? renderEditForm('left')
                                        : renderReadOnlyPanel('left')}
                                  </div>
                                </div>

                                {/* Right panel — shown once opponent is known */}
                                {(entry.matchupDetail || orphanOpponentId) && (
                                  <div className={`dc-panel${editingSide === 'right' ? ' dc-primary-panel' : ' dc-opponent-panel'}`}>
                                    <div className="dc-panel-header">
                                      <span className="dc-panel-team-name">{rightTeamName}</span>
                                      {isRightVacant
                                        ? <span className="dc-vacant-badge">VACANT</span>
                                        : editingSide === 'right'
                                          ? <span className="dc-editing-badge">EDITING</span>
                                          : <span className="dc-readonly-badge">READ-ONLY</span>}
                                    </div>
                                    <div className="dc-panel-body">
                                      {loadingOrphanOpp
                                        ? <p className="admin-loading">Loading opponent…</p>
                                        : isRightVacant && !expandedDetail
                                          ? renderVacantPanel()
                                          : editingSide === 'right'
                                            ? renderEditForm('right')
                                            : renderReadOnlyPanel('right')}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {saveMsg && <p className="admin-success-msg">{saveMsg}</p>}
                              {saveError && <p className="admin-error-msg">{saveError}</p>}

                              <div className="dc-delete-zone">
                                <button type="button" className="admin-btn-danger dc-delete-btn"
                                  onClick={handleDeleteData} disabled={deletingData}>
                                  {deletingData ? 'Deleting…' : '✕ Delete Week Data'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )

                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ VALIDATE MATCHUPS ═══════════ */}
      {mode === 'validate' && (
        <div className="dc-validate-mode">
          <ol className="dc-intro admin-form-hint">
            <li>Bulk-fetch all matchupDetails and bowlerScores for the season in parallel.</li>
            <li>Index bowlerScores by team + week — count docs per slot, sum g1/g2/g3.</li>
            <li>For each matchupDetail, check both teams:
              <ul>
                <li>Doc count ≠ 4 → <strong>invalid</strong></li>
                <li>Count = 4 but stored game totals don't match score sums → <strong>invalid</strong> (stale — e.g. blind doc added after pipeline wrote the record)</li>
              </ul>
            </li>
            <li>Sort results by week.</li>
          </ol>

          <div className="dc-validate-top-actions">
            <button
              type="button"
              className="admin-btn-primary"
              onClick={runValidation}
              disabled={runningValidation || autoFixRunning}
            >
              {runningValidation ? 'Running…' : 'Run Validation'}
            </button>

            {validationComplete && validationResults.some(r => !r.valid) && (
              <button
                type="button"
                className="admin-btn-primary"
                onClick={handleAutoFix}
                disabled={autoFixRunning || runningValidation}
              >
                {autoFixRunning
                  ? 'Fixing…'
                  : `Auto-Fix All ${validationResults.filter(r => !r.valid).length} Invalid Matchup${validationResults.filter(r => !r.valid).length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>

          {validationComplete && (() => {
            const invalid = validationResults.filter(r => !r.valid)
            const displayed = showValidAll ? validationResults : (invalid.length > 0 ? invalid : validationResults)
            return (
              <div className="dc-validate-results">
                <div className="dc-validate-summary">
                  <span className="dc-validate-stat dc-validate-stat--total">
                    {validationResults.length} matchup{validationResults.length !== 1 ? 's' : ''} checked
                  </span>
                  <span className="dc-validate-stat dc-validate-stat--ok">
                    {validationResults.length - invalid.length} valid
                  </span>
                  {invalid.length > 0 && (
                    <span className="dc-validate-stat dc-validate-stat--bad">
                      {invalid.length} invalid
                    </span>
                  )}
                  {invalid.length > 0 && (
                    <button
                      type="button"
                      className="dc-validate-toggle"
                      onClick={() => setShowValidAll(v => !v)}
                    >
                      {showValidAll ? 'Show invalid only' : 'Show all'}
                    </button>
                  )}
                </div>

                {displayed.length === 0 && (
                  <p className="dc-validate-all-ok">All matchups are valid — each team has exactly 4 score docs.</p>
                )}

                {displayed.length > 0 && (
                  <table className="dc-validate-table">
                    <thead>
                      <tr>
                        <th className="dc-val-week">Wk</th>
                        <th className="dc-val-team">Team 1</th>
                        <th className="dc-val-count" title="Number of bowlerScore documents for this team this week (must be exactly 4)">Scores</th>
                        <th className="dc-val-team">Team 2</th>
                        <th className="dc-val-count" title="Number of bowlerScore documents for this team this week (must be exactly 4)">Scores</th>
                        <th className="dc-val-status">Status</th>
                        <th className="dc-val-action"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map(r => (
                        <tr key={r.matchupDetailId} className={r.valid ? '' : 'dc-val-row--invalid'}>
                          <td className="dc-val-week">{r.week}</td>
                          <td className="dc-val-team">{r.team1Name}</td>
                          <td className={`dc-val-count ${r.team1Manual ? 'dc-val-count--manual' : r.team1Count !== 4 ? 'dc-val-count--bad' : 'dc-val-count--ok'}`}>
                            {r.team1Manual ? 'Manual' : r.team1Count}
                          </td>
                          <td className="dc-val-team">{r.team2Name}</td>
                          <td className={`dc-val-count ${r.team2Manual ? 'dc-val-count--manual' : r.team2Count !== 4 ? 'dc-val-count--bad' : 'dc-val-count--ok'}`}>
                            {r.team2Manual ? 'Manual' : r.team2Count}
                          </td>
                          <td className="dc-val-status">
                            {r.valid
                              ? <span className="dc-val-ok">Valid</span>
                              : <span className="dc-val-bad">
                                  {[
                                    !r.team1Manual && r.team1Count !== 4 && `${r.team1Name}: ${r.team1Count}/4`,
                                    !r.team2Manual && r.team2Count !== 4 && `${r.team2Name}: ${r.team2Count}/4`,
                                    r.team1Mismatch && `${r.team1Name}: totals stale`,
                                    r.team2Mismatch && `${r.team2Name}: totals stale`,
                                  ].filter(Boolean).join(' · ')}
                                </span>
                            }
                          </td>
                          <td className="dc-val-action">
                            {!r.valid && (
                              (!r.team1Manual && r.team1Count !== 4) || (!r.team2Manual && r.team2Count !== 4)
                                ? (
                                  <button
                                    type="button"
                                    className="admin-btn-edit dc-val-fix-btn"
                                    onClick={() => handleFixMatchup(r.week)}
                                  >
                                    Fix
                                  </button>
                                ) : (
                                  <span className="dc-val-count--manual">Auto-Fix ↑</span>
                                )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}


                {autoFixMsg && <p className="admin-success-msg">{autoFixMsg}</p>}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

export default DataCorrectionAdmin
