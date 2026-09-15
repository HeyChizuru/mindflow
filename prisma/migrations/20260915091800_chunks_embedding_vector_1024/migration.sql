-- Qwen3-Embedding-0.6B 输出最高 1024 维；空表可直接改列类型
ALTER TABLE "chunks" ALTER COLUMN "embedding" TYPE vector(1024);
