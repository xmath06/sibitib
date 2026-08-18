/**
 * Seed data untuk development.
 * Jalankan: bun run db:seed
 * Memakai DATABASE_URL dari .env.
 */
import { db } from "@/db";
import {
  users,
  classes,
  subjects,
  topics,
  questions,
  options,
  examPackages,
  packageQuestions,
  examSchedules,
  scheduleAllocations,
  scheduleTargets,
} from "@/db/schema";
import { hashPassword } from "@/utils/password";

async function main() {
  console.log("🌱 Seeding database...");

  // ===== Classes =====
  const [kelasIX] = await db
    .insert(classes)
    .values({ gradeLevel: 9, name: "IX IPA 1" })
    .returning();
  const [kelasX] = await db
    .insert(classes)
    .values({ gradeLevel: 10, name: "X IPA 1" })
    .returning();

  console.log(`✓ Classes: ${kelasIX?.name}, ${kelasX?.name}`);

  // ===== Users =====
  const [admin, teacher, student1, student2] = await db
    .insert(users)
    .values([
      {
        name: "Administrator",
        username: "admin",
        passwordHash: await hashPassword("admin123"),
        role: "ADMIN",
      },
      {
        name: "Pak Budi S.Pd",
        username: "guru",
        passwordHash: await hashPassword("guru123"),
        role: "TEACHER",
      },
      {
        name: "Siswa Andi",
        username: "andi",
        passwordHash: await hashPassword("siswa123"),
        role: "STUDENT",
        classId: kelasIX!.id,
        religion: "ISLAM",
      },
      {
        name: "Siswa Bima",
        username: "bima",
        passwordHash: await hashPassword("siswa123"),
        role: "STUDENT",
        classId: kelasIX!.id,
        religion: "KRISTEN",
      },
    ])
    .returning();

  console.log(`✓ Users: ${admin?.username}, ${teacher?.username}, ${student1?.username}, ${student2?.username}`);

  // ===== Subject & Topic =====
  const [matematika] = await db
    .insert(subjects)
    .values({ code: "MTK", name: "Matematika" })
    .returning();
  const [agamaIslam] = await db
    .insert(subjects)
    .values({ code: "AGM_ISL", name: "Agama Islam", religion: "ISLAM" })
    .returning();
  const [aljabar] = await db
    .insert(topics)
    .values({ subjectId: matematika!.id, name: "Aljabar" })
    .returning();

  console.log(`✓ Subject: ${matematika?.name}, Topic: ${aljabar?.name}`);

  // ===== Questions & Options =====
  const [q1, q2, q3] = await db
    .insert(questions)
    .values([
      {
        topicId: aljabar!.id,
        questionText: "Berapakah hasil dari 2 + 2?",
        questionType: "MCQ",
      },
      {
        topicId: aljabar!.id,
        questionText: "Jelaskan konsep variabel dalam aljabar.",
        questionType: "ESSAY",
        minWordCount: 10,
        maxWordCount: 200,
      },
      {
        topicId: aljabar!.id,
        questionText: "Manakah yang merupakan bilangan genap?",
        questionType: "MULTI_SELECT",
      },
    ])
    .returning();

  await db.insert(options).values([
    { questionId: q1!.id, optionText: "3", scoreWeight: "0" },
    { questionId: q1!.id, optionText: "4", scoreWeight: "1" },
    { questionId: q1!.id, optionText: "5", scoreWeight: "0" },
    { questionId: q1!.id, optionText: "22", scoreWeight: "0" },
    { questionId: q3!.id, optionText: "2", scoreWeight: "0.5" },
    { questionId: q3!.id, optionText: "7", scoreWeight: "0" },
    { questionId: q3!.id, optionText: "8", scoreWeight: "0.5" },
  ]);

  console.log(`✓ Questions: ${q1?.questionType}, ${q2?.questionType}, ${q3?.questionType}`);

  // ===== Package & PackageQuestions =====
  const [pkg] = await db
    .insert(examPackages)
    .values({
      subjectId: matematika!.id,
      title: "Ulangan Harian Aljabar",
      hasTimer: true,
      durationMinutes: 30,
      passScore: "7",
      totalQuestions: 3,
      isRandomQuestions: false,
      isRandomOptions: false,
    })
    .returning();

  await db.insert(packageQuestions).values([
    { packageId: pkg!.id, questionId: q1!.id, orderNumber: 1 },
    { packageId: pkg!.id, questionId: q2!.id, orderNumber: 2 },
    { packageId: pkg!.id, questionId: q3!.id, orderNumber: 3 },
  ]);

  console.log(`✓ Package: ${pkg?.title} (${pkg?.totalQuestions} soal)`);

  // ===== Schedule & Allocations =====
  const now = new Date();
  const [schedule] = await db
    .insert(examSchedules)
    .values({
      packageId: pkg!.id,
      title: "UH Aljabar Kelas IX",
      category: "EXAM",
      accessCode: "MTK123",
      startTime: new Date(now.getTime() - 5 * 60 * 1000),
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      showResultImmediately: true,
      scheduleStatus: "ON_GOING",
      targetType: "BY_CLASS",
      targetReligion: null,
    })
    .returning();

  await db.insert(scheduleTargets).values([
    { scheduleId: schedule!.id, targetClassId: kelasIX!.id },
  ]);

  await db.insert(scheduleAllocations).values([
    { scheduleId: schedule!.id, studentId: student1!.id },
    { scheduleId: schedule!.id, studentId: student2!.id },
  ]);

  // Jadwal kedua: menyasar grade 10 (tidak terlihat Andi/Bima yang grade 9)
  const [scheduleGrade] = await db
    .insert(examSchedules)
    .values({
      packageId: pkg!.id,
      title: "Ulangan Latihan Kelas X",
      category: "PRACTICE",
      startTime: new Date(now.getTime() - 5 * 60 * 1000),
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      showResultImmediately: true,
      scheduleStatus: "ON_GOING",
      targetType: "BY_GRADE",
      targetReligion: "ISLAM",
    })
    .returning();
  await db.insert(scheduleTargets).values([
    { scheduleId: scheduleGrade!.id, targetGradeLevel: 10 },
  ]);

  console.log(`✓ Schedule: ${schedule?.title} (${schedule?.accessCode})`);
  console.log(`✓ Schedule grade-targeted: ${scheduleGrade?.title}`);
  console.log("✅ Seed selesai!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed gagal:", err);
  process.exit(1);
});