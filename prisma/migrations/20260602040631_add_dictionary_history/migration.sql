-- CreateTable
CREATE TABLE "DictionaryHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "hanzi" TEXT NOT NULL,
    "pinyin" TEXT,
    "sv" TEXT,
    "vi" TEXT,
    "aiExplanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryHistory_userId_hanzi_key" ON "DictionaryHistory"("userId", "hanzi");

-- AddForeignKey
ALTER TABLE "DictionaryHistory" ADD CONSTRAINT "DictionaryHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
