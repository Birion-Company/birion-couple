/** Quanto falta e quanto guardar por mês para uma meta. Puro, sem banco. */
export type GoalPlan = { remainingCents: number; monthsLeft: number; perMonthCents: number; pct: number; done: boolean; late: boolean };

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

/** Meses de nowMonth até targetMonth (mínimo 1 enquanto a meta não foi batida). */
export function goalPlan(targetCents: number, savedCents: number, targetMonth: string, nowMonth: string): GoalPlan {
  const remainingCents = Math.max(0, targetCents - savedCents);
  const diff = monthIndex(targetMonth) - monthIndex(nowMonth);
  const monthsLeft = Math.max(1, diff);
  const done = remainingCents === 0;
  return {
    remainingCents,
    monthsLeft,
    perMonthCents: done ? 0 : Math.ceil(remainingCents / monthsLeft),
    pct: targetCents > 0 ? Math.min(100, Math.floor((savedCents / targetCents) * 100)) : 0,
    done,
    late: !done && diff < 0,
  };
}
