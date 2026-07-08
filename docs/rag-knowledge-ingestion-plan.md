# RAG Knowledge Base and Ingestion Plan

## Objective

Build a knowledge ingestion system that accepts uploaded documents and website crawls, converts them into cited searchable chunks, tracks token usage, and feeds AI replies with retrieved context.

## Scope

- Upload text documents: TXT, Markdown, HTML, PDF, DOCX, CSV, XLSX.
- Upload image/scanned documents with OCR.
- Preview original documents and extracted text.
- Edit extracted text documents before indexing.
- Edit CSV/XLSX-derived tables before indexing.
- Crawl websites through Firecrawl.
- Track token usage for ingestion and answer generation.
- Retrieve knowledge with hybrid keyword and vector search.
- Show citations in AI replies.

## Data Model

- `KnowledgeDocument`: uploaded file or crawled website source.
- `KnowledgeIngestionRun`: each extraction, OCR, chunking, embedding, crawl, or reindex job.
- `KnowledgeChunk`: searchable chunk with source offsets, page number, sheet name, row range, URL, and embedding metadata.
- `TokenUsage`: provider, model, feature, operation, prompt tokens, completion tokens, embedding tokens, estimated cost, entity references.
- `WebsiteSource`: Firecrawl config, include/exclude rules, crawl depth, schedule, last crawl status.

## Pipeline

1. Store source file or URL config.
2. Extract raw text or tables.
3. OCR if the source has scanned pages or images.
4. Normalize extracted content.
5. Let admins preview and optionally edit extracted content.
6. Chunk by semantic section, page, or row range.
7. Generate embeddings.
8. Store chunks with source citations.
9. Retrieve chunks during AI reply generation.
10. Save token usage and retrieval citations.

## Token Accounting

Track token usage for:

- OCR cleanup that uses an LLM.
- Document summarization or normalization.
- Chunk embedding.
- Query rewriting.
- RAG answer generation.
- Workflow AI reply generation.

Expose usage by:

- Document.
- Ingestion run.
- Conversation.
- Workflow.
- Date range.
- Provider and model.

## Firecrawl Integration

Support:

- Single URL scrape.
- Sitemap crawl.
- Crawl depth.
- Include and exclude URL patterns.
- Scheduled recrawls.
- Manual recrawl.
- Crawl diff detection.
- Source URL citations.

## UI

- Knowledge Documents page with upload, crawl, status, token usage, and actions.
- Document reader with original preview and extracted text.
- Text/DOC editor for cleaned content.
- Excel-style editor for CSV/XLSX tables.
- Ingestion run detail with logs, errors, retries, and token usage.
- RAG test panel showing retrieved chunks and final answer.

## Acceptance Criteria

- Admin can upload a PDF, DOCX, XLSX, CSV, TXT, or image and index it.
- Admin can crawl a website with Firecrawl and index selected pages.
- Scanned content can be OCR processed.
- AI replies show source citations from retrieved chunks.
- Every LLM or embedding operation records token usage.
- Failed ingestion steps are visible and retryable.
