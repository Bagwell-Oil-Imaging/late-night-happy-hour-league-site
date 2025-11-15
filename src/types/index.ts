export interface Team {
  id: number;
  name: string;
  captain: string;
  wins: number;
  losses: number;
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
