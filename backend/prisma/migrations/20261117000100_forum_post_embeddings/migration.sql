-- Optional AI forum search (WBS-23.2, docs/AiForumSearch.md).
-- Vectors are plain double precision arrays, so no database extension is needed.

-- CreateTable
CREATE TABLE "forum_post_embeddings" (
    "post_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[],
    "content_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forum_post_embeddings_pkey" PRIMARY KEY ("post_id")
);

-- AddForeignKey
ALTER TABLE "forum_post_embeddings" ADD CONSTRAINT "forum_post_embeddings_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
