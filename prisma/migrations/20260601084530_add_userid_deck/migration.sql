/*
  Warnings:

  - You are about to drop the `_DeckToFlashcard` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[deckId,hanzi,meaning]` on the table `Flashcard` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `deckId` to the `Flashcard` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "_DeckToFlashcard" DROP CONSTRAINT "_DeckToFlashcard_A_fkey";

-- DropForeignKey
ALTER TABLE "_DeckToFlashcard" DROP CONSTRAINT "_DeckToFlashcard_B_fkey";

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "Flashcard" ADD COLUMN     "deckId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "_DeckToFlashcard";

-- CreateIndex
CREATE UNIQUE INDEX "Flashcard_deckId_hanzi_meaning_key" ON "Flashcard"("deckId", "hanzi", "meaning");

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
