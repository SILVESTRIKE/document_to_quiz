/**
 * Database Migration: Questions Extraction
 * 
 * Migrates embedded questions from Quiz documents to separate Question collection.
 * This improves performance and avoids MongoDB 16MB document limit.
 * 
 * Usage: npx ts-node src/migrations/001-extract-questions.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Quiz from "../models/quiz.model";
import Question from "../models/question.model";

dotenv.config();

async function runMigration() {
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/quiz-app";

    console.log("🔄 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    try {
        // 1. Get all quizzes with embedded questions
        const quizzes = await Quiz.find({
            questions: { $exists: true, $ne: [] }
        }).lean();

        console.log(`📊 Found ${quizzes.length} quizzes with embedded questions`);

        let totalMigrated = 0;
        let totalFailed = 0;

        for (const quiz of quizzes) {
            const quizId = quiz._id;
            const questions = quiz.questions || [];

            if (questions.length === 0) continue;

            // Check if already migrated
            const existingCount = await Question.countDocuments({ quizId });
            if (existingCount > 0) {
                console.log(`⏭️  Quiz ${quizId}: Already migrated (${existingCount} questions)`);
                continue;
            }

            try {
                // 2. Create Question documents
                const questionDocs = questions.map((q: any, idx: number) => ({
                    quizId,
                    index: idx + 1,
                    stem: q.stem,
                    choices: q.choices,
                    correctAnswerKey: q.correctAnswerKey || "",
                    explanation: q.explanation || "",
                    source: q.source || "AI_Generated",
                    section: q.section || "",
                }));

                // 3. Bulk insert
                await Question.insertMany(questionDocs, { ordered: false });

                // 4. Update Quiz to clear embedded questions (optional - keep for backward compat)
                // await Quiz.updateOne(
                //     { _id: quizId },
                //     { $set: { questionsExtracted: true } }
                // );

                totalMigrated += questions.length;
                console.log(`✅ Quiz ${quizId}: Migrated ${questions.length} questions`);

            } catch (err: any) {
                totalFailed += questions.length;
                console.error(`❌ Quiz ${quizId}: Migration failed -`, err.message);
            }
        }

        console.log("\n" + "=".repeat(50));
        console.log("📈 MIGRATION SUMMARY");
        console.log("=".repeat(50));
        console.log(`✅ Total questions migrated: ${totalMigrated}`);
        console.log(`❌ Total questions failed: ${totalFailed}`);
        console.log(`📊 Total quizzes processed: ${quizzes.length}`);

        // 5. Create indexes if not exist
        console.log("\n🔧 Ensuring indexes...");
        await Question.collection.createIndex({ quizId: 1, index: 1 });
        await Question.collection.createIndex({ quizId: 1, section: 1 });
        console.log("✅ Indexes created");

    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log("\n🔌 Disconnected from MongoDB");
    }
}

// Run migration
runMigration()
    .then(() => {
        console.log("✅ Migration completed successfully");
        process.exit(0);
    })
    .catch((err) => {
        console.error("❌ Migration error:", err);
        process.exit(1);
    });
