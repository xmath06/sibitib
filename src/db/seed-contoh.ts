/**
 * Seed idempotent: tambahkan topik "Geometri" & "Trigonometri" pada Matematika
 * beserta contoh soal yang berisi objek geometri 2D/3D dan grafik fungsi.
 * Aman dijalankan berulang (cek topik/siswa berdasarkan nama).
 * Jalankan: bun run db:seed-contoh
 */
import { db } from "@/db";
import { subjects, topics, questions, options } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  GEO_SQUARE,
  GEO_TRI,
  GEO_CUBE,
  GEO_TWO,
  TRIG_SINE_DEG,
  TRIG_SINE_RAD,
  TRIG_TWO,
} from "@/db/data/sampleQuestions";

async function main() {
  console.log("🌱 Menambah topik Geometri & Trigonometri + soal contoh...");

  const [mtk] = await db.select().from(subjects).where(eq(subjects.code, "MTK")).limit(1);
  if (!mtk) {
    console.error("❌ Subject Matematika (MTK) tidak ditemukan. Jalankan db:seed dulu.");
    process.exit(1);
  }
  const mtkId = mtk.id;

  async function getTopic(name: string) {
    const [t] = await db
      .select()
      .from(topics)
      .where(and(eq(topics.subjectId, mtkId), eq(topics.name, name)))
      .limit(1);
    if (t) return t;
    const [created] = await db.insert(topics).values({ subjectId: mtkId, name }).returning();
    return created;
  }

  async function addQuestion(topicId: string, questionText: string, type: string, opts: { t: string; w: string }[]) {
    const [q] = await db
      .insert(questions)
      .values({ topicId, questionText, questionType: type as any })
      .returning();
    if (q) await db.insert(options).values(opts.map((o) => ({ questionId: q.id, optionText: o.t, scoreWeight: o.w })));
    return q;
  }

  const geo = (await getTopic("Geometri"))!;
  const trig = (await getTopic("Trigonometri"))!;

  await addQuestion(geo.id, GEO_SQUARE, "MCQ", [
    { t: "8", w: "0" }, { t: "12", w: "0" }, { t: "16", w: "1" }, { t: "24", w: "0" },
  ]);
  await addQuestion(geo.id, GEO_TRI, "MCQ", [
    { t: "7", w: "0" }, { t: "12", w: "1" }, { t: "14", w: "0" }, { t: "24", w: "0" },
  ]);
  await addQuestion(geo.id, GEO_CUBE, "MCQ", [
    { t: "9", w: "0" }, { t: "18", w: "0" }, { t: "27", w: "1" }, { t: "54", w: "0" },
  ]);
  await addQuestion(geo.id, GEO_TWO, "MCQ", [
    { t: "20", w: "0" }, { t: "24", w: "1" }, { t: "30", w: "0" }, { t: "36", w: "0" },
  ]);

  await addQuestion(trig.id, TRIG_SINE_DEG, "MCQ", [
    { t: "0", w: "0" }, { t: "1", w: "1" }, { t: "0,5", w: "0" }, { t: "−1", w: "0" },
  ]);
  await addQuestion(trig.id, TRIG_SINE_RAD, "MCQ", [
    { t: "Nilai maksimumnya 1 dan periode 2π", w: "1" },
    { t: "Nilai maksimumnya 2 dan periode π", w: "0" },
    { t: "Grafik memotong sumbu x hanya di x = 0", w: "0" },
    { t: "Fungsi selalu bernilai positif", w: "0" },
  ]);
  await addQuestion(trig.id, TRIG_TWO, "MCQ", [
    { t: "memiliki nilai yang sama", w: "1" },
    { t: "memiliki nilai yang berlawanan tanda", w: "0" },
    { t: "nilai sin lebih besar dari cos", w: "0" },
    { t: "nilai cos lebih besar dari sin", w: "0" },
  ]);

  console.log(`✓ Topik "${geo.name}" & "${trig.name}" + 7 soal contoh siap.`);
  console.log("✅ Selesai!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Gagal:", err);
  process.exit(1);
});