export interface Team {
  id: number;
  name: string;
  captain: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
}

export interface Event {
  id: number;
  title: string;
  date: string;
  location: string;
  type: 'regular' | 'tournament' | 'social';
  description: string;
}

export interface Matchup {
  id: number;
  week: number;
  date: string;
  team1Id: number;
  team2Id: number;
  team1Score: number | null;
  team2Score: number | null;
  completed: boolean;
}

export interface CarouselImage {
  id: number;
  title: string;
  description: string;
  image: string;
  alt: string;
}

export interface SeasonTeam {
  id: number;
  name: string;
  wins: number;
  losses: number;
  points: number;
}

export interface Season {
  year: string;
  startDate: string;
  endDate: string;
  champion: string;
  teams: SeasonTeam[];
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  date: string;
  type: 'reminder' | 'event' | 'info';
  priority: 'low' | 'normal' | 'high';
}

export interface BowlerScore {
  name: string;
  g1: number;
  g2: number;
  g3: number;
  series: number;
  average: number;
}

export interface TeamDetail {
  id: number;
  name: string;
  lane: number;
  bowlers: BowlerScore[];
  gameTotals: { g1: number; g2: number; g3: number };
  scratchSeries: number;
  teamAvg: number;
  handicapPerGame: number;
  handicapSeries: number;
  totalSeries: number;
}

export interface MatchupDetail {
  id: number;
  week: number;
  date: string;
  team1: TeamDetail;
  team2: TeamDetail;
}

export interface BowlerWeek {
  week: number;
  date: string;
  lane: number | null;
  opponentTeamId: number | null;
  opponentTeamName: string;
  g1: number;
  g2: number;
  g3: number;
  series: number;
}

export interface ScheduleWeek {
  /** Bowling week number (sequential, skips not counted). Null for off-weeks. */
  week: number | null;
  /** Week number used as the key in weeklyMatchupDetails.json / matchups.json. */
  dataWeek: number | null;
  date: string;
  status: 'completed' | 'upcoming' | 'skip';
  skipReason: string | null;
  event: string | null;
}

export interface BowlerStat {
  id: string;
  name: string;
  teamId: number;
  teamName: string;
  average: number;
  enteringAvg: number;
  highGame: number;
  highSeries: number;
  weeks: BowlerWeek[];
}
