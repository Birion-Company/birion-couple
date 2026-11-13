import { redirect } from "next/navigation";

/** Metas agora têm página própria no menu. */
export default function GoalsMoved() {
  redirect("/metas");
}
