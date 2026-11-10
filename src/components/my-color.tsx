"use client";

import { useState, useTransition } from "react";
import { setMyColor } from "@/app/actions/settings";
import { ColorPicker } from "./list-editor";
import { toastResult } from "./toaster";

/** A sua cor: aparece no seu círculo (quando não há foto), nas divisões e nos gráficos. */
export function MyColor({ color }: { color: string }) {
  const [value, setValue] = useState(color);
  const [pending, start] = useTransition();
  return (
    <section className="card section" aria-labelledby="minha-cor">
      <h2 id="minha-cor" style={{ marginBottom: 4 }}>Sua cor</h2>
      <p className="faint" style={{ marginBottom: 10 }}>Aparece nas divisões, nas dívidas e nos gráficos.</p>
      <div style={{ opacity: pending ? 0.6 : 1 }}>
        <ColorPicker
          value={value}
          onChange={(c) => {
            setValue(c);
            start(async () => toastResult(await setMyColor(c)));
          }}
        />
      </div>
    </section>
  );
}
