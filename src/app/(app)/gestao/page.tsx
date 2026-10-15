import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PERFIS_GESTAO } from "./_lib/visual";

export default async function GestaoPage() {
  await requireUser([...PERFIS_GESTAO]);
  redirect("/gestao/abc");
}
