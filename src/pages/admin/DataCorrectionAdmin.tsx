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

import { useState, useEffect, useMemo } from 'react'
import {
  collection, query, where, getDocs,
  addDoc, updateDoc, deleteDoc, doc, setDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useTeams, useScheduleWeeks } from '../../hooks'
import { useSeasonYear } from '../../context/SeasonContext'
import type { Bowler, BowlerScore, MatchupDetail, Team, TeamSummary } from '../../types'
import './AnnouncementsAdmin.css'
import './DataCorrectionAdmin.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const HDCP_PCT = 0.85

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeTeamName(name?: string): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Returns 1 for a win, 0 for a loss, 0.5 for a tie. */
function gPoint(a: number, b: number): number {
  return a > b ? 1 : a < b ? 0 : 0.5
}

// ── Local types ───────────────────────────────────────────────────────────────

interface RosterRow {
  id: string
  firstName: string
  lastName: string
  enteringAvg: string
  saving: boolean
}

type ScoreInputs = Record<string, { g1: string; g2: string; g3: string }>

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

// ── Component ─────────────────────────────────────────────────────────────────

function DataCorrectionAdmin() {
  const seasonYear = useSeasonYear()
  const { data: teams } = useTeams(seasonYear)
  const { data: scheduleWeeks } = useScheduleWeeks(seasonYear)

  // ── Top-level mode ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'teams' | 'scores'>('teams')

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
  const [leftExistingDocs, setLeftExistingDocs] = useState<Record<string, string>>({})
  const [rightExistingDocs, setRightExistingDocs] = useState<Record<string, string>>({})

  // Opponent selector for orphan entries
  const [orphanOpponentId, setOrphanOpponentId] = useState('')
  const [loadingOrphanOpp, setLoadingOrphanOpp] = useState(false)

  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savingScores, setSavingScores] = useState(false)
  const [savingTeamTotals, setSavingTeamTotals] = useState(false)
  const [deletingData, setDeletingData] = useState(false)
  /** When true, shows a read-only summary of both panels after a successful save. */
  const [showSummary, setShowSummary] = useState(false)

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
  const activeTeamId = editingSide === 'left' ? leftTeamId : rightTeamId
  const activeTeam = teams.find(t => t.id === activeTeamId)
  const activeSideKey: 'team1' | 'team2' = editingSide === 'left' ? 'team1' : 'team2'
  const oppSideKey: 'team1' | 'team2' = editingSide === 'left' ? 'team2' : 'team1'

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
      if ((t.name ?? '').toLowerCase().includes('vacant')) return false
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
    try {
      await updateDoc(doc(db, 'bowlers', row.id), {
        firstName, lastName, name, enteringAvg, averageFloat: enteringAvg, adminOverride: true,
      })
      setRosterMsg(`${name} saved.`)
    } catch {
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
    try {
      await deleteDoc(doc(db, 'bowlers', id))
      setBowlersCache(prev => ({ ...prev, [teamId]: (prev[teamId] ?? []).filter(b => b.id !== id) }))
      setRosterCache(prev => ({ ...prev, [teamId]: (prev[teamId] ?? []).filter(r => r.id !== id) }))
      setRosterMsg(`${name} removed.`)
    } catch {
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
      const ref = await addDoc(collection(db, 'bowlers'), data)
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
    } catch {
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

  function resetEditorState() {
    setEditingSide('left')
    setScoreEntryMode('individual')
    setTeamTotalsInputs({ g1: '', g2: '', g3: '', points: '' })
    setOrphanOpponentId('')
    setLeftBowlers([])
    setRightBowlers([])
    setLeftScoreInputs({})
    setRightScoreInputs({})
    setLeftExistingDocs({})
    setRightExistingDocs({})
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

    setLoadingExpanded(true)
    try {
      if (!entry.matchupDetail) {
        // Orphan: load left team's bowlers; right side waits for opponent selection
        const bowlerSnap = await getDocs(
          query(collection(db, 'bowlers'), where('teamId', '==', entry.orphanTeam!.id), where('seasonYear', '==', seasonYear))
        )
        setLeftBowlers(bowlerSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)))
        // Pre-fill left inputs from orphanBowlerScores
        const inputs: ScoreInputs = {}
        const eDocs: Record<string, string> = {}
        for (const bs of entry.orphanBowlerScores) {
          inputs[bs.bowlerId] = {
            g1: bs.game1 != null ? String(bs.game1) : '',
            g2: bs.game2 != null ? String(bs.game2) : '',
            g3: bs.game3 != null ? String(bs.game3) : '',
          }
          eDocs[bs.bowlerId] = bs.id!
        }
        setLeftScoreInputs(inputs)
        setLeftExistingDocs(eDocs)
        return
      }

      // Regular matchup: load both sides in parallel
      const d = entry.matchupDetail
      const t1Id = d.team1?.teamId ?? ''
      const t2Id = d.team2?.teamId ?? ''
      const [t1Bowlers, t2Bowlers, t1Scores, t2Scores] = await Promise.all([
        getDocs(query(collection(db, 'bowlers'), where('teamId', '==', t1Id), where('seasonYear', '==', seasonYear))),
        getDocs(query(collection(db, 'bowlers'), where('teamId', '==', t2Id), where('seasonYear', '==', seasonYear))),
        getDocs(query(collection(db, 'bowlerScores'), where('teamId', '==', t1Id), where('seasonYear', '==', seasonYear), where('week', '==', selectedWeek))),
        getDocs(query(collection(db, 'bowlerScores'), where('teamId', '==', t2Id), where('seasonYear', '==', seasonYear), where('week', '==', selectedWeek))),
      ])

      setLeftBowlers(t1Bowlers.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)))
      setRightBowlers(t2Bowlers.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)))

      const buildInputs = (snap: typeof t1Scores) => {
        const inputs: ScoreInputs = {}
        const eDocs: Record<string, string> = {}
        for (const doc of snap.docs) {
          const bs = doc.data() as BowlerScore
          inputs[bs.bowlerId] = {
            g1: bs.game1 != null ? String(bs.game1) : '',
            g2: bs.game2 != null ? String(bs.game2) : '',
            g3: bs.game3 != null ? String(bs.game3) : '',
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

      // If left side has only team totals, switch to that mode and pre-fill
      if (d.team1?.individualScoresUnavailable) {
        setScoreEntryMode('teamTotals')
        setTeamTotalsInputs({
          g1: String(d.team1.game1Total), g2: String(d.team1.game2Total),
          g3: String(d.team1.game3Total),
          points: String(d.team1.points),
        })
      }
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
        setTeamTotalsInputs({
          g1: String(side.game1Total), g2: String(side.game2Total),
          g3: String(side.game3Total),
          points: String(side.points),
        })
      }
    }
  }

  // ── Orphan opponent selection ──────────────────────────────────────────────

  async function handleOrphanOpponentSelect(opponentId: string) {
    setOrphanOpponentId(opponentId)
    if (!opponentId || !selectedWeek) return
    setLoadingOrphanOpp(true)
    try {
      const [bSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, 'bowlers'), where('teamId', '==', opponentId), where('seasonYear', '==', seasonYear))),
        getDocs(query(collection(db, 'bowlerScores'), where('teamId', '==', opponentId), where('seasonYear', '==', seasonYear), where('week', '==', selectedWeek))),
      ])
      setRightBowlers(bSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bowler)))
      const inputs: ScoreInputs = {}
      const eDocs: Record<string, string> = {}
      for (const d of sSnap.docs) {
        const bs = d.data() as BowlerScore
        inputs[bs.bowlerId] = {
          g1: bs.game1 != null ? String(bs.game1) : '',
          g2: bs.game2 != null ? String(bs.game2) : '',
          g3: bs.game3 != null ? String(bs.game3) : '',
        }
        eDocs[bs.bowlerId] = d.id
      }
      setRightScoreInputs(inputs)
      setRightExistingDocs(eDocs)
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
    let g1 = 0, g2 = 0, g3 = 0, teamAvg = 0, any = false
    for (const b of activeBowlers) {
      const s = activeScoreInputs[b.id!]
      const v1 = parseInt(s?.g1 ?? '') || 0
      const v2 = parseInt(s?.g2 ?? '') || 0
      const v3 = parseInt(s?.g3 ?? '') || 0
      if (v1 === 0 && v2 === 0 && v3 === 0) continue
      any = true
      g1 += v1; g2 += v2; g3 += v3
      teamAvg += b.enteringAvg ?? 0
    }
    if (!any) return null
    const oppAvg = expandedDetail?.[oppSideKey]?.teamAvg ?? 0
    const hdcp = Math.max(0, Math.floor((oppAvg - teamAvg) * HDCP_PCT))
    const scratch = g1 + g2 + g3
    return { g1, g2, g3, scratch, teamAvg, hdcp, hdcpSeries: hdcp * 3, total: scratch + hdcp * 3 }
  }, [activeBowlers, activeScoreInputs, expandedDetail, oppSideKey, scoreEntryMode])

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
   * Opponent's with-handicap game totals. Used as the baseline for auto-point
   * calculation. Returns null when opponent data is not yet available.
   */
  const opponentDisplayTotals = useMemo(() => {
    if (!expandedEntry) return null

    if (expandedDetail) {
      const s = expandedDetail[oppSideKey]
      if (!s) return null
      return {
        g1: s.game1Total + s.handicapPerGame,
        g2: s.game2Total + s.handicapPerGame,
        g3: s.game3Total + s.handicapPerGame,
        total: s.totalSeries,
      }
    }

    // Fall back to summing opponent's bowlerScore inputs
    const oppBowlers = editingSide === 'left' ? rightBowlers : leftBowlers
    const oppInputs  = editingSide === 'left' ? rightScoreInputs : leftScoreInputs
    let g1 = 0, g2 = 0, g3 = 0
    for (const b of oppBowlers) {
      const s = oppInputs[b.id!]
      g1 += parseInt(s?.g1 ?? '') || 0
      g2 += parseInt(s?.g2 ?? '') || 0
      g3 += parseInt(s?.g3 ?? '') || 0
    }
    if (g1 === 0 && g2 === 0 && g3 === 0) return null

    // Compute opponent's handicap relative to the active team's avg
    const myTeamAvg = activeBowlers.reduce((s, b) => s + (b.enteringAvg ?? 0), 0)
    const oppTeamId  = editingSide === 'left' ? rightTeamId : leftTeamId
    const oppTeam    = teams.find(t => t.id === oppTeamId)
    const oppAvg     = oppTeam?.average ?? 0
    const oppHdcp    = Math.max(0, Math.floor((myTeamAvg - oppAvg) * HDCP_PCT))
    return {
      g1: g1 + oppHdcp,
      g2: g2 + oppHdcp,
      g3: g3 + oppHdcp,
      total: g1 + g2 + g3 + oppHdcp * 3,
    }
  }, [
    expandedEntry, expandedDetail, oppSideKey, editingSide,
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
      const weekDate = scheduleWeeks.find(sw => sw.week === selectedWeek)?.date ?? ''
      const opponentTeamId = expandedDetail?.[oppSideKey]?.teamId ?? ''
      const opponentTeamName = expandedDetail?.[oppSideKey]?.teamName ?? ''
      const myLane = expandedDetail?.[activeSideKey]?.lane ?? 0
      const matchupId = expandedDetail?.matchupId ?? ''

      type AB = { bowler: Bowler; g1: number; g2: number; g3: number }
      const active: AB[] = []

      for (const b of activeBowlers) {
        const s = activeScoreInputs[b.id!]
        const g1 = parseInt(s?.g1 ?? '') || 0
        const g2 = parseInt(s?.g2 ?? '') || 0
        const g3 = parseInt(s?.g3 ?? '') || 0
        if (g1 === 0 && g2 === 0 && g3 === 0) continue
        active.push({ bowler: b, g1, g2, g3 })
        const scoreData: Omit<BowlerScore, 'id'> = {
          bowlerId: b.id!, bowlerName: b.name,
          teamId: activeTeamId, teamName: activeTeam.name,
          opponentTeamId, opponentTeamName, matchupId,
          seasonYear, week: selectedWeek as number, date: weekDate, actualBowlDate: weekDate,
          lanePair: myLane, game1: g1, game2: g2, game3: g3, series: g1 + g2 + g3,
          preBowled: false, blinded: false, isSubstitute: false, substituteFor: null,
          rollingAvg: null, rollingGames: 0, adminOverride: true,
        }
        const existingId = activeExistingDocs[b.id!]
        if (existingId) {
          await updateDoc(doc(db, 'bowlerScores', existingId), scoreData)
        } else {
          const ref = await addDoc(collection(db, 'bowlerScores'), scoreData)
          if (editingSide === 'left') {
            setLeftExistingDocs(prev => ({ ...prev, [b.id!]: ref.id }))
          } else {
            setRightExistingDocs(prev => ({ ...prev, [b.id!]: ref.id }))
          }
        }
      }

      if (expandedEntry?.matchupDetailDocId && expandedDetail) {
        const game1Total = active.reduce((s, b) => s + b.g1, 0)
        const game2Total = active.reduce((s, b) => s + b.g2, 0)
        const game3Total = active.reduce((s, b) => s + b.g3, 0)
        const scratchSeries = game1Total + game2Total + game3Total
        const myTeamAvg = active.reduce((s, b) => s + (b.bowler.enteringAvg ?? 0), 0)
        const oppAvg = expandedDetail[oppSideKey]?.teamAvg ?? 0
        const myHdcp = Math.max(0, Math.floor((oppAvg - myTeamAvg) * HDCP_PCT))
        const oppHdcp = Math.max(0, Math.floor((myTeamAvg - oppAvg) * HDCP_PCT))
        const myPoints  = autoPoints ?? expandedDetail[activeSideKey]?.points ?? 0
        const oppPoints = autoPoints != null ? 4 - autoPoints : expandedDetail[oppSideKey]?.points ?? 0
        const updatedMy: TeamSummary = {
          ...expandedDetail[activeSideKey],
          teamAvg: myTeamAvg, game1Total, game2Total, game3Total,
          scratchSeries, handicapPerGame: myHdcp, handicapSeries: myHdcp * 3,
          totalSeries: scratchSeries + myHdcp * 3, points: myPoints,
        }
        const updatedOpp: TeamSummary = {
          ...expandedDetail[oppSideKey],
          handicapPerGame: oppHdcp, handicapSeries: oppHdcp * 3,
          totalSeries: expandedDetail[oppSideKey].scratchSeries + oppHdcp * 3,
          points: oppPoints,
        }
        await updateDoc(doc(db, 'matchupDetails', expandedEntry.matchupDetailDocId), {
          [activeSideKey]: updatedMy, [oppSideKey]: updatedOpp, adminOverride: true,
        })
        setWeekEntries(prev => prev.map(e =>
          e.id !== expandedEntryId ? e
            : { ...e, matchupDetail: { ...expandedDetail, [activeSideKey]: updatedMy, [oppSideKey]: updatedOpp } }
        ))
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
        const updatedMy: TeamSummary = {
          ...expandedDetail[activeSideKey],
          game1Total: g1, game2Total: g2, game3Total: g3,
          scratchSeries: total, handicapPerGame: 0, handicapSeries: 0,
          totalSeries: total, points: safePoints, individualScoresUnavailable: true,
        }
        const updatedOpp: TeamSummary = { ...expandedDetail[oppSideKey], points: 4 - safePoints }
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
        // No matchupDetails — create one. Fetch opponent scratch game totals.
        const oppTeamId = orphanOpponentId || (editingSide === 'left' ? rightTeamId : leftTeamId)
        if (!oppTeamId) {
          setSaveError('Select an opponent team before saving.')
          setSavingTeamTotals(false)
          return
        }
        const oppTeam = teams.find(t => t.id === oppTeamId)
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
        const myData: TeamSummary = {
          teamId: activeTeamId, teamName: activeTeam.name, lane: 0,
          teamAvg: 0, game1Total: g1, game2Total: g2, game3Total: g3,
          scratchSeries: total, handicapPerGame: 0, handicapSeries: 0,
          totalSeries: total, points: safePoints, individualScoresUnavailable: true,
        }
        const oppData: TeamSummary = {
          teamId: oppTeamId, teamName: oppTeam?.name ?? 'Opponent', lane: 0,
          teamAvg: oppAvg, game1Total: oppG1, game2Total: oppG2, game3Total: oppG3,
          scratchSeries: oppScratch, handicapPerGame: 0, handicapSeries: 0,
          totalSeries: oppScratch, points: 4 - safePoints,
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
      return (
        <>
          {bowlers.length > 0 && (
            <table className="dc-scores-table">
              <thead><tr>
                <th className="dc-name-col">Bowler</th>
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
                        <td className="dc-bowler-name">{b.name}</td>
                        <td className="dc-na-cell">N/A</td>
                        <td className="dc-na-cell">N/A</td>
                        <td className="dc-na-cell">N/A</td>
                        <td className="dc-na-cell">N/A</td>
                      </tr>
                    )
                  }
                  const inp = inputs[b.id!]
                  const g1 = parseInt(inp?.g1 ?? '') || 0
                  const g2 = parseInt(inp?.g2 ?? '') || 0
                  const g3 = parseInt(inp?.g3 ?? '') || 0
                  return (
                    <tr key={b.id}>
                      <td className="dc-bowler-name">{b.name}</td>
                      <td>{g1 > 0 ? g1 : <span className="dc-empty">—</span>}</td>
                      <td>{g2 > 0 ? g2 : <span className="dc-empty">—</span>}</td>
                      <td>{g3 > 0 ? g3 : <span className="dc-empty">—</span>}</td>
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
              <th className="dc-score-col">G1</th>
              <th className="dc-score-col">G2</th>
              <th className="dc-score-col">G3</th>
              <th className="dc-series-col">Series</th>
            </tr></thead>
            <tfoot>
              {s.individualScoresUnavailable ? (
                <tr className="dc-totals-final">
                  <td>Total w/ Hdcp</td>
                  <td>{s.game1Total}</td><td>{s.game2Total}</td><td>{s.game3Total}</td>
                  <td>{s.totalSeries}</td>
                </tr>
              ) : (
                <>
                  <tr className="dc-totals-scratch">
                    <td>Scratch</td>
                    <td>{s.game1Total}</td><td>{s.game2Total}</td><td>{s.game3Total}</td>
                    <td>{s.scratchSeries}</td>
                  </tr>
                  <tr className="dc-totals-handicap">
                    <td>Handicap</td>
                    <td>{s.handicapPerGame}</td><td>{s.handicapPerGame}</td><td>{s.handicapPerGame}</td>
                    <td>{s.handicapSeries}</td>
                  </tr>
                  <tr className="dc-totals-final">
                    <td>Total</td>
                    <td>{s.game1Total + s.handicapPerGame}</td>
                    <td>{s.game2Total + s.handicapPerGame}</td>
                    <td>{s.game3Total + s.handicapPerGame}</td>
                    <td>{s.totalSeries}</td>
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

  /** Renders the active edit form (individual or team totals). */
  function renderEditForm(side: 'left' | 'right') {
    const bowlers = side === 'left' ? leftBowlers : rightBowlers
    const scoreInputs = side === 'left' ? leftScoreInputs : rightScoreInputs
    const setScoreInputs = side === 'left' ? setLeftScoreInputs : setRightScoreInputs
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
                setTeamTotalsInputs({
                  g1: String(s.game1Total), g2: String(s.game2Total), g3: String(s.game3Total),
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
            {bowlers.length === 0 ? (
              <p className="admin-form-hint">No bowlers on roster. Add them in Edit Teams.</p>
            ) : (
              <table className="dc-scores-table">
                <thead><tr>
                  <th className="dc-name-col">Bowler</th>
                  <th className="dc-score-col">G1</th>
                  <th className="dc-score-col">G2</th>
                  <th className="dc-score-col">G3</th>
                  <th className="dc-series-col">Series</th>
                </tr></thead>
                <tbody>
                  {bowlers.map(b => {
                    const s = scoreInputs[b.id!] ?? { g1: '', g2: '', g3: '' }
                    const g1 = parseInt(s.g1) || 0
                    const g2 = parseInt(s.g2) || 0
                    const g3 = parseInt(s.g3) || 0
                    return (
                      <tr key={b.id}>
                        <td className="dc-bowler-name">{b.name}</td>
                        <td><input className="admin-input dc-score-input" type="number" min={0} max={300}
                          value={s.g1} placeholder="—"
                          onChange={e => setScoreInputs(prev => ({ ...prev, [b.id!]: { ...prev[b.id!] ?? { g1: '', g2: '', g3: '' }, g1: e.target.value } }))} /></td>
                        <td><input className="admin-input dc-score-input" type="number" min={0} max={300}
                          value={s.g2} placeholder="—"
                          onChange={e => setScoreInputs(prev => ({ ...prev, [b.id!]: { ...prev[b.id!] ?? { g1: '', g2: '', g3: '' }, g2: e.target.value } }))} /></td>
                        <td><input className="admin-input dc-score-input" type="number" min={0} max={300}
                          value={s.g3} placeholder="—"
                          onChange={e => setScoreInputs(prev => ({ ...prev, [b.id!]: { ...prev[b.id!] ?? { g1: '', g2: '', g3: '' }, g3: e.target.value } }))} /></td>
                        <td className="dc-series-cell">
                          {g1 + g2 + g3 > 0 ? g1 + g2 + g3 : <span className="dc-empty">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {liveTotals && (
                  <tfoot>
                    <tr className="dc-totals-scratch">
                      <td>Scratch</td>
                      <td>{liveTotals.g1}</td><td>{liveTotals.g2}</td><td>{liveTotals.g3}</td>
                      <td>{liveTotals.scratch}</td>
                    </tr>
                    <tr className="dc-totals-handicap">
                      <td>Handicap</td>
                      <td>{liveTotals.hdcp}</td><td>{liveTotals.hdcp}</td><td>{liveTotals.hdcp}</td>
                      <td>{liveTotals.hdcpSeries}</td>
                    </tr>
                    <tr className="dc-totals-final">
                      <td>Total</td>
                      <td>{liveTotals.g1 + liveTotals.hdcp}</td>
                      <td>{liveTotals.g2 + liveTotals.hdcp}</td>
                      <td>{liveTotals.g3 + liveTotals.hdcp}</td>
                      <td>{liveTotals.total}</td>
                    </tr>
                    {autoPoints != null && (
                      <tr className="dc-totals-points">
                        <td>Points Won</td>
                        <td colSpan={4} className="dc-auto-points">{autoPoints}</td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
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
          </div>

          {selectedWeek !== '' && (
            <div className="dc-week-matchups">
              {loadingWeek ? (
                <p className="admin-loading">Loading week {selectedWeek} matchups…</p>
              ) : weekEntries.length === 0 ? (
                <p className="admin-form-hint">No matchup data found for week {selectedWeek}.</p>
              ) : (
                weekEntries.map(entry => {
                  const isExpanded = expandedEntryId === entry.id
                  const d = entry.matchupDetail

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
                              <span className="dc-entry-totals">
                                <span className="dc-entry-total-score">{d?.team1?.totalSeries ?? '—'}</span>
                                <span className="dc-entry-vs">vs</span>
                                <span className="dc-entry-total-score">{d?.team2?.totalSeries ?? '—'}</span>
                              </span>
                              <span className="dc-entry-team">{d?.team2?.teamName ?? '?'}</span>
                            </span>
                            <span className="dc-entry-pts">{d?.team1?.points ?? '?'} – {d?.team2?.points ?? '?'} pts</span>
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
                                <button type="button" className="admin-btn-secondary dc-switch-btn"
                                  onClick={handleSwitchSide}>
                                  ⇄ Switch to {editingSide === 'left' ? rightTeamName : leftTeamName}
                                </button>
                              </div>
                              )}

                              {/* Two-panel layout */}
                              <div className="dc-matchup-panels">
                                {/* Left panel */}
                                <div className={`dc-panel${editingSide === 'left' ? ' dc-primary-panel' : ' dc-opponent-panel'}`}>
                                  <div className="dc-panel-header">
                                    <span className="dc-panel-team-name">{leftTeamName}</span>
                                    {editingSide === 'left'
                                      ? <span className="dc-editing-badge">EDITING</span>
                                      : <span className="dc-readonly-badge">READ-ONLY</span>}
                                  </div>
                                  <div className="dc-panel-body">
                                    {editingSide === 'left'
                                      ? renderEditForm('left')
                                      : renderReadOnlyPanel('left')}
                                  </div>
                                </div>

                                {/* Right panel — shown once opponent is known */}
                                {(entry.matchupDetail || orphanOpponentId) && (
                                  <div className={`dc-panel${editingSide === 'right' ? ' dc-primary-panel' : ' dc-opponent-panel'}`}>
                                    <div className="dc-panel-header">
                                      <span className="dc-panel-team-name">{rightTeamName}</span>
                                      {editingSide === 'right'
                                        ? <span className="dc-editing-badge">EDITING</span>
                                        : <span className="dc-readonly-badge">READ-ONLY</span>}
                                    </div>
                                    <div className="dc-panel-body">
                                      {loadingOrphanOpp
                                        ? <p className="admin-loading">Loading opponent…</p>
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
    </div>
  )
}

export default DataCorrectionAdmin
