"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { setCleanPeople } from "@/app/actions/settings";
import { CONTACT_DELETE_DAYS, CONTACT_IDLE_DAYS } from "@/lib/defaults";
import { toastResult } from "./toaster";

/** "Excluir pessoas após certo período de tempo?": liga ou desliga a limpeza automática das pessoas guardadas. */
export function CleanPeopleToggle({ on }: { on: boolean }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const next = !value;
      const r = await setCleanPeople(next);
      toastResult(r);
      if (r.ok) setValue(next);
    });
  return (
    <div className="clean-people">
      <button type="button" className={`switch-row${value ? " on" : ""}`} role="switch" aria-checked={value} disabled={pending} onClick={toggle}>
        <Trash2 size={16} strokeWidth={1.7} aria-hidden />
        <span>Excluir pessoas após certo período de tempo?</span>
        <i className="switch" aria-hidden />
      </button>
      <p className="faint">
        {value
          ? `Ligado: quem fica ${CONTACT_IDLE_DAYS} dias sem aparecer vai para as guardadas e, ${CONTACT_DELETE_DAYS} dias depois, é apagada. As fixadas nunca saem.`
          : `Desligado: quem fica ${CONTACT_IDLE_DAYS} dias sem aparecer só vai para as guardadas, e ninguém é apagado.`}
      </p>
    </div>
  );
}
