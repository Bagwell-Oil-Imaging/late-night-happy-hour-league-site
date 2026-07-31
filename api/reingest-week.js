/**
 * Vercel serverless function - re-fetch and overwrite one scored week.
 *
 * POST /api/reingest-week
 * Body: { seasonYear: string, week: number, confirm?: boolean }
 */

import admin from 'firebase-admin';
import { calculateGameHandicap } from '../src/utils/handicap.js';

const LEAGUE_ID = '688118301406d3982ec379a1';
const BASE_URL = 'https://www.leaguepals.com';
const BOWLERS_PER_TEAM = 4;

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  }
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function requireAdmin(req, res) {
  const localBypassEnabled = process.env.LOCAL_API_SERVER === 'true'
    && process.env.LOCAL_ADMIN_BYPASS === 'true';
  if (localBypassEnabled && req.headers['x-local-admin-bypass'] === 'true') {
    console.warn('[reingest-week] Local admin bypass accepted. This must only run in local development.');
    initFirebaseAdmin();
    return true;
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' });
    return false;
  }

  try {
    initFirebaseAdmin();
    await admin.auth().verifyIdToken(match[1]);
    return true;
  } catch (err) {
    console.error('[reingest-week] Token verification failed:', err.message);
    res.status(401).json({ error: 'Unauthorized. The Firebase ID token is invalid or expired.' });
    return false;
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function fetchLeagueData() {
  const [laneSchedule, standings, leaguePublic] = await Promise.all([
    fetchJSON(`${BASE_URL}/laneSchedule?league_id=${LEAGUE_ID}&simple=false&withLeagueTime=true`),
    fetchJSON(`${BASE_URL}/api/getStandingsPublic?leagueId=${LEAGUE_ID}`),
    fetchJSON(`${BASE_URL}/getLeaguePublic?id=${LEAGUE_ID}`),
  ]);

  const teamIds = new Set();
  for (const week of laneSchedule.schedule ?? []) {
    const matches = (week.splitMatches?.length > 0 ? week.splitMatches : week.matches) ?? [];
    for (const match of matches) {
      if (match.team1_id) teamIds.add(match.team1_id);
      if (match.team2_id) teamIds.add(match.team2_id);
    }
  }

  const teamEntries = await Promise.all([...teamIds].map(async teamId => {
    const data = await fetchJSON(`${BASE_URL}/api/loadIndividualTeamPublic?id=${teamId}`);
    return [teamId, data.data ?? []];
  }));

  return { laneSchedule, standings, leaguePublic, teamsById: new Map(teamEntries) };
}

function dateOnly(value) {
  return String(value ?? '').slice(0, 10);
}

function getWeekMeta(laneSchedule, targetWeek) {
  let weekNumber = 0;
  for (const rawWeek of laneSchedule.schedule ?? []) {
    const matches = (rawWeek.splitMatches?.length > 0 ? rawWeek.splitMatches : rawWeek.matches) ?? [];
    if (matches.length === 0) continue;
    weekNumber += 1;
    if (weekNumber === targetWeek) {
      return {
        weekNumber,
        date: dateOnly(rawWeek.date),
        matches,
      };
    }
  }
  return null;
}

function buildLookups(laneSchedule, standings) {
  const teamNames = new Map();
  for (const row of standings.data?.standings ?? []) {
    if (row.team?._id) teamNames.set(row.team._id, row.team.name ?? '');
  }

  const weekNumByDate = new Map();
  const laneLookup = new Map();
  let weekNumber = 0;
  for (const rawWeek of laneSchedule.schedule ?? []) {
    const matches = (rawWeek.splitMatches?.length > 0 ? rawWeek.splitMatches : rawWeek.matches) ?? [];
    if (matches.length === 0) continue;
    weekNumber += 1;
    const date = dateOnly(rawWeek.date);
    weekNumByDate.set(date, weekNumber);
    const byTeam = new Map();
    for (const match of matches) {
      const lane1 = match.team1_lane ?? 0;
      const lane2 = match.team2_lane ?? 0;
      const lanePair = lane1 % 2 === 1 ? lane1 : lane2;
      byTeam.set(match.team1_id, {
        lane: lanePair,
        opponentTeamId: match.team2_id,
        opponentTeamName: teamNames.get(match.team2_id) ?? '',
        leaguePalsMatchId: match._id ?? '',
      });
      byTeam.set(match.team2_id, {
        lane: lanePair,
        opponentTeamId: match.team1_id,
        opponentTeamName: teamNames.get(match.team1_id) ?? '',
        leaguePalsMatchId: match._id ?? '',
      });
    }
    laneLookup.set(date, byTeam);
  }

  return { teamNames, weekNumByDate, laneLookup };
}

function buildBowlerScores({ teamsById, weekNumByDate, laneLookup, leaguePublic, seasonYear }) {
  const docs = [];
  const enteringAvgMap = new Map();
  const teamRosterMap = new Map();
  let blindPenaltyPct = 0.10;
  const rawPct = leaguePublic?.againstBlindScorePct;
  if (typeof rawPct === 'number') {
    const blindScorePct = rawPct > 1 ? rawPct / 100 : rawPct;
    blindPenaltyPct = 1 - blindScorePct;
  }

  for (const [teamId, players] of teamsById.entries()) {
    teamRosterMap.set(teamId, players);
    for (const player of players) {
      if (player._id && !enteringAvgMap.has(player._id)) {
        enteringAvgMap.set(player._id, player.enteringAvg ?? player.average ?? 0);
      }

      for (const [dateKey, entries] of Object.entries(player.weekGames ?? {})) {
        if (!Array.isArray(entries) || entries.length === 0) continue;
        const entry = entries[0];
        const games = entry?.games ?? [];
        const preBowled = entry?.isMatch === false;
        const scheduledDate = preBowled ? (entry.matchDate ?? dateKey) : dateKey;
        const week = weekNumByDate.get(scheduledDate) ?? weekNumByDate.get(dateKey) ?? 0;
        if (!week) continue;

        const laneInfo = laneLookup.get(scheduledDate)?.get(teamId) ?? laneLookup.get(dateKey)?.get(teamId);
        const actualGames = games.slice(0, 3).filter(g => typeof g === 'number');
        const blinded = actualGames.length === 0;
        const game1 = typeof games[0] === 'number' ? games[0] : null;
        const game2 = typeof games[1] === 'number' ? games[1] : null;
        const game3 = typeof games[2] === 'number' ? games[2] : null;
        const series = actualGames.length > 0
          ? actualGames.reduce((sum, score) => sum + score, 0)
          : null;

        docs.push({
          bowlerId: player._id ?? '',
          bowlerName: `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim(),
          teamId,
          teamName: player.teamName ?? '',
          opponentTeamId: laneInfo?.opponentTeamId ?? '',
          opponentTeamName: laneInfo?.opponentTeamName ?? '',
          leaguePalsMatchId: laneInfo?.leaguePalsMatchId ?? '',
          matchupId: '',
          seasonYear,
          week,
          date: scheduledDate,
          actualBowlDate: preBowled ? dateKey : null,
          lanePair: laneInfo?.lane ?? 0,
          game1,
          game2,
          game3,
          series,
          preBowled,
          blinded,
          isSubstitute: false,
          substituteFor: null,
          substituteAvg: null,
        });
      }
    }
  }

  completeTeamWeeks(docs, teamRosterMap, enteringAvgMap, blindPenaltyPct, seasonYear);
  applyRollingAverages(docs, enteringAvgMap, blindPenaltyPct);
  return docs;
}

function completeTeamWeeks(docs, teamRosterMap, enteringAvgMap, blindPenaltyPct, seasonYear) {
  const scratchGamesBeforeWeek = new Map();
  const scratchAvgBeforeWeek = new Map();
  const byBowler = new Map();
  for (const doc of docs) {
    if (doc.blinded || doc.series === null) continue;
    if (!byBowler.has(doc.bowlerId)) byBowler.set(doc.bowlerId, []);
    byBowler.get(doc.bowlerId).push(doc);
  }
  for (const [bowlerId, entries] of byBowler.entries()) {
    entries.sort((a, b) => a.week - b.week);
    let pins = 0;
    let games = 0;
    for (const entry of entries) {
      scratchGamesBeforeWeek.set(`${bowlerId}:${entry.week}`, games);
      scratchAvgBeforeWeek.set(`${bowlerId}:${entry.week}`, games > 0 ? Math.floor(pins / games) : (enteringAvgMap.get(bowlerId) ?? 0));
      pins += entry.series;
      games += [entry.game1, entry.game2, entry.game3].filter(g => typeof g === 'number').length;
    }
  }

  const teamWeekDocs = new Map();
  for (const doc of docs) {
    const key = `${doc.teamId}:${doc.week}`;
    if (!teamWeekDocs.has(key)) teamWeekDocs.set(key, []);
    teamWeekDocs.get(key).push(doc);
  }

  const blindPriority = (a, b, week) => {
    const aId = a.bowlerId ?? a._id;
    const bId = b.bowlerId ?? b._id;
    const gDiff = (scratchGamesBeforeWeek.get(`${bId}:${week}`) ?? 0) - (scratchGamesBeforeWeek.get(`${aId}:${week}`) ?? 0);
    if (gDiff !== 0) return gDiff;
    const avgA = scratchAvgBeforeWeek.get(`${aId}:${week}`) ?? a.enteringAvg ?? enteringAvgMap.get(aId) ?? 0;
    const avgB = scratchAvgBeforeWeek.get(`${bId}:${week}`) ?? b.enteringAvg ?? enteringAvgMap.get(bId) ?? 0;
    return avgB - avgA;
  };

  for (const [key, existing] of teamWeekDocs.entries()) {
    const [teamId, weekString] = key.split(':');
    const week = Number(weekString);
    const roster = teamRosterMap.get(teamId) ?? [];
    if (roster.length === 0) continue;

    const actualCount = existing.filter(d => !d.blinded).length;
    if (actualCount === 0) continue;

    const allowedBlindCount = Math.max(0, Math.min(BOWLERS_PER_TEAM - actualCount, 3));
    const blindDocs = existing.filter(d => d.blinded).sort((a, b) => blindPriority(a, b, week));
    const excess = new Set(blindDocs.slice(allowedBlindCount));
    if (excess.size > 0) {
      for (let i = docs.length - 1; i >= 0; i -= 1) {
        if (excess.has(docs[i])) docs.splice(i, 1);
      }
      existing.splice(0, existing.length, ...existing.filter(d => !excess.has(d)));
    }

    if (existing.length >= BOWLERS_PER_TEAM) continue;
    const present = new Set(existing.map(d => d.bowlerId));
    const absent = roster.filter(p => p._id && !present.has(p._id)).sort((a, b) => blindPriority(a, b, week));
    const maxNew = Math.min(BOWLERS_PER_TEAM - existing.length, allowedBlindCount - existing.filter(d => d.blinded).length, absent.length);
    const ref = existing[0];

    for (let i = 0; i < maxNew; i += 1) {
      const player = absent[i];
      docs.push({
        bowlerId: player._id,
        bowlerName: `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim(),
        teamId,
        teamName: ref.teamName,
        opponentTeamId: ref.opponentTeamId,
        opponentTeamName: ref.opponentTeamName,
        leaguePalsMatchId: ref.leaguePalsMatchId,
        matchupId: ref.matchupId,
        seasonYear,
        week,
        date: ref.date,
        actualBowlDate: null,
        lanePair: ref.lanePair,
        game1: null,
        game2: null,
        game3: null,
        series: null,
        preBowled: false,
        blinded: true,
        isSubstitute: false,
        substituteFor: null,
        substituteAvg: null,
      });
    }
  }
}

function applyRollingAverages(docs, enteringAvgMap, blindPenaltyPct) {
  const byBowler = new Map();
  for (const doc of docs) {
    if (!byBowler.has(doc.bowlerId)) byBowler.set(doc.bowlerId, []);
    byBowler.get(doc.bowlerId).push(doc);
  }

  for (const bowlerDocs of byBowler.values()) {
    bowlerDocs.sort((a, b) => a.week - b.week);
    let pins = 0;
    let games = 0;
    for (const doc of bowlerDocs) {
      // Average entering THIS week — pins/games accumulated through the prior
      // week only. Used for the blind score and as this bowler's contribution
      // to team average/handicap, so those don't drift as later weeks change
      // the bowler's overall average.
      const avgBeforeThisWeek = games > 0 ? Math.floor(pins / games) : (enteringAvgMap.get(doc.bowlerId) ?? 0);
      doc.avgBeforeThisWeek = avgBeforeThisWeek;
      if (doc.blinded) {
        const blindScore = avgBeforeThisWeek - Math.floor(avgBeforeThisWeek * blindPenaltyPct);
        doc.game1 = blindScore;
        doc.game2 = blindScore;
        doc.game3 = blindScore;
        doc.series = blindScore * 3;
      } else if (doc.series !== null) {
        pins += doc.series;
        games += [doc.game1, doc.game2, doc.game3].filter(g => typeof g === 'number').length;
      }
      doc.rollingAvg = games > 0 ? Math.floor(pins / games) : null;
      doc.rollingGames = games;
    }
  }
}

function teamSummary(teamId, teamName, lane, scores) {
  const game1Total = scores.reduce((sum, score) => sum + (score.game1 ?? 0), 0);
  const game2Total = scores.reduce((sum, score) => sum + (score.game2 ?? 0), 0);
  const game3Total = scores.reduce((sum, score) => sum + (score.game3 ?? 0), 0);
  const scratchSeries = game1Total + game2Total + game3Total;
  // Per-bowler average ENTERING this week (not this week's own performance,
  // and not their current/live average) — same source MatchupDetailModal
  // already reconstructs, so team average/handicap doesn't drift as later
  // weeks change a bowler's overall average. Bowlers with no usable game data
  // are excluded rather than counted as a 0 average, since a 0 would blow up
  // the basisScore formula (value - 0).
  const bowlerAverages = [];
  for (const score of scores) {
    if (score.blinded) {
      bowlerAverages.push(score.avgBeforeThisWeek ?? 0);
      continue;
    }
    const games = [score.game1, score.game2, score.game3].filter(g => typeof g === 'number').length;
    if (games > 0) bowlerAverages.push(score.avgBeforeThisWeek ?? 0);
  }
  const teamAvg = bowlerAverages.reduce((sum, avg) => sum + avg, 0);

  return {
    teamId,
    teamName,
    lane,
    teamAvg,
    bowlerAverages,
    game1Total,
    game2Total,
    game3Total,
    scratchSeries,
    handicapGame1: 0,
    handicapGame2: 0,
    handicapGame3: 0,
    handicapSeries: 0,
    totalSeries: scratchSeries,
    points: 0,
  };
}

function gPoint(a, b) {
  return a > b ? 1 : a < b ? 0 : 0.5;
}

function applyHandicapAndPoints(team1, team2, handicapConfig) {
  // Computed independently per game — today every active bowler plays all 3
  // games (LeaguePals doesn't report partial-week substitutions), so the 3
  // calls currently always agree, but this is structured to be correct once
  // per-game roster differences exist.
  const t1Hdcp = calculateGameHandicap(
    { teamAvg: team1.teamAvg, opponentAvg: team2.teamAvg, bowlerAverages: team1.bowlerAverages }, handicapConfig,
  );
  const t2Hdcp = calculateGameHandicap(
    { teamAvg: team2.teamAvg, opponentAvg: team1.teamAvg, bowlerAverages: team2.bowlerAverages }, handicapConfig,
  );
  team1.handicapGame1 = t1Hdcp;
  team1.handicapGame2 = t1Hdcp;
  team1.handicapGame3 = t1Hdcp;
  team1.handicapSeries = team1.handicapGame1 + team1.handicapGame2 + team1.handicapGame3;
  team1.totalSeries = team1.scratchSeries + team1.handicapSeries;
  team2.handicapGame1 = t2Hdcp;
  team2.handicapGame2 = t2Hdcp;
  team2.handicapGame3 = t2Hdcp;
  team2.handicapSeries = team2.handicapGame1 + team2.handicapGame2 + team2.handicapGame3;
  team2.totalSeries = team2.scratchSeries + team2.handicapSeries;
  team1.points =
    gPoint(team1.game1Total + team1.handicapGame1, team2.game1Total + team2.handicapGame1) +
    gPoint(team1.game2Total + team1.handicapGame2, team2.game2Total + team2.handicapGame2) +
    gPoint(team1.game3Total + team1.handicapGame3, team2.game3Total + team2.handicapGame3) +
    gPoint(team1.totalSeries, team2.totalSeries);
  team2.points = 4 - team1.points;
  // bowlerAverages was only needed to compute the handicap above — not part
  // of the persisted TeamSummary schema.
  delete team1.bowlerAverages;
  delete team2.bowlerAverages;
}

function buildWeekPayload({ laneSchedule, standings, leaguePublic, teamsById, seasonYear, week, handicapConfig }) {
  const weekMeta = getWeekMeta(laneSchedule, week);
  if (!weekMeta) throw new Error(`Week ${week} was not found in LeaguePals schedule.`);

  const { teamNames, weekNumByDate, laneLookup } = buildLookups(laneSchedule, standings);
  const allScores = buildBowlerScores({ teamsById, weekNumByDate, laneLookup, leaguePublic, seasonYear });
  const weekScores = allScores.filter(score => score.week === week);
  const scoresByTeam = new Map();
  for (const score of weekScores) {
    const key = score.teamId;
    if (!scoresByTeam.has(key)) scoresByTeam.set(key, []);
    scoresByTeam.get(key).push(score);
  }

  const matchups = [];
  const matchupDetails = [];
  for (const match of weekMeta.matches) {
    const team1Scores = scoresByTeam.get(match.team1_id) ?? [];
    const team2Scores = scoresByTeam.get(match.team2_id) ?? [];
    const team1Scratch = team1Scores.reduce((sum, score) => sum + (score.series ?? 0), 0);
    const team2Scratch = team2Scores.reduce((sum, score) => sum + (score.series ?? 0), 0);
    const completed = team1Scores.length > 0 && team2Scores.length > 0 && (team1Scratch > 0 || team2Scratch > 0);

    matchups.push({
      leaguePalsMatchId: match._id ?? '',
      seasonYear,
      week,
      date: weekMeta.date,
      team1Id: match.team1_id ?? '',
      team2Id: match.team2_id ?? '',
      team1Lane: match.team1_lane ?? 0,
      team2Lane: match.team2_lane ?? 0,
      team1ScratchScore: completed ? team1Scratch : null,
      team2ScratchScore: completed ? team2Scratch : null,
      positionRound: false,
      completed,
    });

    if (!completed) continue;
    const lanePair = (match.team1_lane ?? 0) % 2 === 1 ? match.team1_lane : match.team2_lane;
    const team1 = teamSummary(match.team1_id, teamNames.get(match.team1_id) ?? '', lanePair, team1Scores);
    const team2 = teamSummary(match.team2_id, teamNames.get(match.team2_id) ?? '', lanePair, team2Scores);
    applyHandicapAndPoints(team1, team2, handicapConfig);

    matchupDetails.push({
      leaguePalsMatchId: match._id ?? '',
      matchupId: '',
      seasonYear,
      week,
      date: weekMeta.date,
      team1,
      team2,
    });
  }

  return { weekDate: weekMeta.date, matchups, matchupDetails, bowlerScores: weekScores };
}

async function collectOverrideSummary(db, seasonYear, week) {
  const [detailsSnap, scoresSnap] = await Promise.all([
    db.collection('matchupDetails')
      .where('seasonYear', '==', seasonYear)
      .where('week', '==', week)
      .get(),
    db.collection('bowlerScores')
      .where('seasonYear', '==', seasonYear)
      .where('week', '==', week)
      .get(),
  ]);

  const matchupDetails = detailsSnap.docs.filter(doc => doc.data().adminOverride === true).map(doc => {
    const data = doc.data();
    return {
      collection: 'matchupDetails',
      docId: doc.id,
      label: `${data.team1?.teamName ?? 'Team 1'} ${data.team1?.totalSeries ?? 0} (${data.team1?.points ?? 0} pts) vs ${data.team2?.teamName ?? 'Team 2'} ${data.team2?.totalSeries ?? 0} (${data.team2?.points ?? 0} pts)`,
      value: {
        team1: data.team1,
        team2: data.team2,
      },
    };
  });

  const bowlerScores = scoresSnap.docs.filter(doc => doc.data().adminOverride === true).map(doc => {
    const data = doc.data();
    return {
      collection: 'bowlerScores',
      docId: doc.id,
      label: `${data.bowlerName ?? 'Bowler'} (${data.teamName ?? 'Team'}): ${data.game1 ?? '-'} / ${data.game2 ?? '-'} / ${data.game3 ?? '-'}${data.blinded ? ' blind' : ''}`,
      value: {
        bowlerName: data.bowlerName ?? '',
        teamName: data.teamName ?? '',
        game1: data.game1 ?? null,
        game2: data.game2 ?? null,
        game3: data.game3 ?? null,
        series: data.series ?? null,
        blinded: !!data.blinded,
        blind1: !!data.blind1,
        blind2: !!data.blind2,
        blind3: !!data.blind3,
      },
    };
  });

  return {
    count: matchupDetails.length + bowlerScores.length,
    matchupDetails,
    bowlerScores,
  };
}

async function replaceWeek(db, payload, seasonYear, week) {
  const existingMatchupsSnap = await db.collection('matchups')
    .where('seasonYear', '==', seasonYear)
    .where('week', '==', week)
    .get();
  const matchRefsByLpId = new Map();
  existingMatchupsSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.leaguePalsMatchId) matchRefsByLpId.set(data.leaguePalsMatchId, doc.ref);
  });

  const matchupRefs = new Map();
  for (const matchup of payload.matchups) {
    const ref = matchRefsByLpId.get(matchup.leaguePalsMatchId) ?? db.collection('matchups').doc();
    matchupRefs.set(matchup.leaguePalsMatchId, ref);
  }

  payload.bowlerScores.forEach(score => {
    score.matchupId = matchupRefs.get(score.leaguePalsMatchId)?.id ?? '';
    delete score.leaguePalsMatchId;
  });
  payload.matchupDetails.forEach(detail => {
    detail.matchupId = matchupRefs.get(detail.leaguePalsMatchId)?.id ?? '';
    delete detail.leaguePalsMatchId;
  });

  const [oldDetailsSnap, oldScoresSnap] = await Promise.all([
    db.collection('matchupDetails').where('seasonYear', '==', seasonYear).where('week', '==', week).get(),
    db.collection('bowlerScores').where('seasonYear', '==', seasonYear).where('week', '==', week).get(),
  ]);

  const deletes = [
    ...oldDetailsSnap.docs.map(doc => doc.ref),
    ...oldScoresSnap.docs.map(doc => doc.ref),
  ];
  for (let i = 0; i < deletes.length; i += 450) {
    const batch = db.batch();
    deletes.slice(i, i + 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  const sets = [];
  payload.matchups.forEach(matchup => {
    const { leaguePalsMatchId, ...data } = matchup;
    sets.push({ ref: matchupRefs.get(leaguePalsMatchId), data: { ...data, leaguePalsMatchId } });
  });
  payload.matchupDetails.forEach(detail => {
    if (detail.matchupId) {
      sets.push({ ref: db.collection('matchupDetails').doc(detail.matchupId), data: detail });
    }
  });
  payload.bowlerScores.forEach(score => {
    sets.push({
      ref: db.collection('bowlerScores').doc(`${score.bowlerId}_w${String(score.week).padStart(2, '0')}`),
      data: score,
    });
  });

  for (let i = 0; i < sets.length; i += 450) {
    const batch = db.batch();
    sets.slice(i, i + 450).forEach(write => batch.set(write.ref, write.data));
    await batch.commit();
  }

  return {
    deletedMatchupDetails: oldDetailsSnap.size,
    deletedBowlerScores: oldScoresSnap.size,
    writtenMatchups: payload.matchups.length,
    writtenMatchupDetails: payload.matchupDetails.length,
    writtenBowlerScores: payload.bowlerScores.length,
  };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  if (!(await requireAdmin(req, res))) return;

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    res.status(400).json({ error: `Invalid JSON body: ${err.message}` });
    return;
  }

  const seasonYear = String(body.seasonYear ?? '').trim();
  const week = Number(body.week);
  const confirm = body.confirm === true;
  if (!seasonYear || !Number.isInteger(week) || week < 1) {
    res.status(400).json({ error: 'Expected body fields: seasonYear (string), week (positive integer).' });
    return;
  }

  try {
    const db = admin.firestore();
    const [leagueData, overrideSummary, leagueConfigSnap] = await Promise.all([
      fetchLeagueData(),
      collectOverrideSummary(db, seasonYear, week),
      db.collection('leagueConfig').doc(seasonYear).get(),
    ]);
    const handicapConfig = leagueConfigSnap.exists ? leagueConfigSnap.data() : {};
    const payload = buildWeekPayload({ ...leagueData, seasonYear, week, handicapConfig });

    const generated = {
      matchups: payload.matchups.length,
      matchupDetails: payload.matchupDetails.length,
      bowlerScores: payload.bowlerScores.length,
      weekDate: payload.weekDate,
    };

    if (!confirm) {
      res.status(200).json({ dryRun: true, generated, overrideSummary });
      return;
    }

    const writeSummary = await replaceWeek(db, payload, seasonYear, week);
    res.status(200).json({
      dryRun: false,
      generated,
      overrideSummary,
      writeSummary,
    });
  } catch (err) {
    console.error('[reingest-week] Failed:', err);
    res.status(500).json({ error: err.message || 'Week re-ingest failed.' });
  }
}
