// fpl-bootstrap-enums.ts

/**
 * Player positions from `element_types.id`.
 * Also see `element_types[].singular_name_short` (GKP/DEF/MID/FWD).
 */
export enum ElementTypeId {
  GOALKEEPER = 1,
  DEFENDER = 2,
  MIDFIELDER = 3,
  FORWARD = 4,
}

/**
 * Common player availability codes from `elements[].status`.
 * Treat anything !== 'a' as flagged/needs attention.
 */
export enum PlayerStatus {
  /** Available */
  AVAILABLE = 'a',
  /** Doubtful (typically shows a yellow flag) */
  DOUBTFUL = 'd',
  /** Injured */
  INJURED = 'i',
  /** Suspended */
  SUSPENDED = 's',
  /** Not available (e.g., not in squad/other) */
  NOT_AVAILABLE = 'n',
}

/**
 * Chips as they appear under `events[].chip_plays[].chip_name`.
 */
export enum ChipName {
  BENCH_BOOST = 'bboost',
  TRIPLE_CAPTAIN = '3xc',
  FREE_HIT = 'freehit',
  WILDCARD = 'wildcard',
}

/**
 * Stat keys used across player objects and `element_stats`.
 * Useful for typing sort keys / selectors.
 */
export enum ElementStatKey {
  MINUTES = 'minutes',
  GOALS_SCORED = 'goals_scored',
  ASSISTS = 'assists',
  CLEAN_SHEETS = 'clean_sheets',
  GOALS_CONCEDED = 'goals_conceded',
  OWN_GOALS = 'own_goals',
  PENALTIES_SAVED = 'penalties_saved',
  PENALTIES_MISSED = 'penalties_missed',
  YELLOW_CARDS = 'yellow_cards',
  RED_CARDS = 'red_cards',
  SAVES = 'saves',
  BONUS = 'bonus',
  BPS = 'bps',
  INFLUENCE = 'influence',
  CREATIVITY = 'creativity',
  THREAT = 'threat',
  ICT_INDEX = 'ict_index',
}

/**
 * Handy lookup objects if you want labels without hard-coding strings everywhere.
 */
export const POSITION_ID_TO_SHORT: Record<ElementTypeId, 'GKP' | 'DEF' | 'MID' | 'FWD'> = {
  [ElementTypeId.GOALKEEPER]: 'GKP',
  [ElementTypeId.DEFENDER]: 'DEF',
  [ElementTypeId.MIDFIELDER]: 'MID',
  [ElementTypeId.FORWARD]: 'FWD',
};

export const POSITION_ID_TO_NAME: Record<ElementTypeId, 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward'> = {
  [ElementTypeId.GOALKEEPER]: 'Goalkeeper',
  [ElementTypeId.DEFENDER]: 'Defender',
  [ElementTypeId.MIDFIELDER]: 'Midfielder',
  [ElementTypeId.FORWARD]: 'Forward',
};

/**
 * Small helper: prices come as tenths of £m (e.g. 72 => £7.2m).
 */
export const priceTenthsToMillions = (now_cost: number) => now_cost / 10;

