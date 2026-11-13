import { describe, expect, it } from "vitest";
import { cardsFor, isAdmin, seesAll, visibleTx, type Viewer } from "@/lib/access";

const ana: Viewer = { householdId: "h", userId: "u-ana", participantId: "p-ana", role: "owner" };
const beto: Viewer = { householdId: "h", userId: "u-beto", participantId: "p-beto", role: "owner" };

describe("privacidade do casal", () => {
  it("as duas pessoas do casal administram, mas nenhuma vê os dados da outra", () => {
    for (const v of [ana, beto]) {
      expect(isAdmin(v)).toBe(true);
      expect(seesAll(v)).toBe(false);
      expect(visibleTx(v)).toBeDefined(); // sempre há filtro por pessoa
    }
  });

  it("cada pessoa vê só os próprios cartões, mesmo administrando", () => {
    const cards = [{ ownerId: "p-ana" }, { ownerId: "p-beto" }, { ownerId: null }];
    expect(cardsFor(ana, cards)).toEqual([{ ownerId: "p-ana" }]);
    expect(cardsFor(beto, cards)).toEqual([{ ownerId: "p-beto" }]);
  });

  it("só a conta de auditoria da plataforma enxerga tudo", () => {
    const auditor: Viewer = { householdId: "h", userId: "aud", participantId: null, role: "owner", all: true };
    expect(seesAll(auditor)).toBe(true);
    expect(visibleTx(auditor)).toBeUndefined();
    expect(cardsFor(auditor, [{ ownerId: "p-ana" }, { ownerId: "p-beto" }])).toHaveLength(2);
  });
});
