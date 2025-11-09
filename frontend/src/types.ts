// src/types.ts
export type Choice = 'NONE' | 'GRAB' | 'SKIM' | 'HOLD';

export interface Player {
  id: string;
  nick: string;
  addr: string;
  isBot: boolean;
  floor: number;         // 1..50
  deposit: number;       // KEY (demo)
  baseChoice: Choice;    // выбран ДО старта
  finalChoice: Choice;   // зафиксирован при раскрытии
  revealed: boolean;
  success?: boolean;
  payout?: number;
}

export interface SessionState {
  id: string;
  status: 'WAITING' | 'RUNNING' | 'DONE';
  pool: number;
  treasury: number;
  nextPool: number;
  successWindowGrab: number; // 17 старт
  successWindowSkim: number; // 40 старт
  holdStreak: number;        // 0..5
  claimed: boolean;
}

// Константы демо
export const FLOORS = 50;
export const STOP_SECONDS = 2; // задержка на этаже (сек)
